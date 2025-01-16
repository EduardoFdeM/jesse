import { S3 } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

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
    
    console.log(`📤 Iniciando upload para ${folder}/${fileName}`);
    
    try {
        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: process.env.AWS_S3_BUCKET || '',
                Key: `${folder}/${fileName}`,
                Body: fileBuffer,
                ACL: 'public-read',
                ContentType: determineContentType(fileName)
            }
        });

        upload.on('httpUploadProgress', (progress) => {
            console.log(`📊 Progresso do upload: ${progress.loaded}/${progress.total}`);
        });

        await upload.done();
        console.log('✅ Upload concluído com sucesso');
        
        return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${folder}/${fileName}`;
    } catch (error) {
        console.error('❌ Erro no upload:', error);
        throw error;
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