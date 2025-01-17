import { S3 } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as awsGetSignedUrl } from '@aws-sdk/s3-request-presigner';

// Configurações do S3
export const s3Client = new S3({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
});

type FileType = 'translation' | 'knowledge';

export const uploadToS3 = async (
    fileBuffer: Buffer, 
    fileName: string, 
    type: FileType = 'translation'
): Promise<string> => {
    // Definir pasta baseado no tipo
    const folder = type === 'translation' ? 'translated_pdfs' : 'knowledge_base';
    
    try {
        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: process.env.AWS_S3_BUCKET || '',
                Key: `${folder}/${fileName}`,
                Body: fileBuffer,
                ContentType: determineContentType(fileName)
            }
        });

        await upload.done();
        
        return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${folder}/${fileName}`;
    } catch (error) {
        console.error('Erro no upload para S3:', error);
        throw new Error('Falha ao fazer upload do arquivo traduzido');
    }
};

// Função auxiliar para determinar o Content-Type
const determineContentType = (fileName: string): string => {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
        case 'pdf':
            return 'application/pdf';
        case 'txt':
            return 'text/plain';
        case 'csv':
            return 'text/csv';
        case 'xlsx':
        case 'xls':
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        case 'doc':
        case 'docx':
            return 'application/msword';
        default:
            return 'application/octet-stream';
    }
};

// Função para gerar URL assinada
export const generateSignedUrl = async (key: string): Promise<string> => {
    const command = new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET || '',
        Key: key
    });

    // URL válida por 15 minutos
    return await awsGetSignedUrl(s3Client, command, { expiresIn: 900 });
};