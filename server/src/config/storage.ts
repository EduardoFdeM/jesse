import { S3 } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const spacesEndpoint = new URL(process.env.SPACES_ENDPOINT || 'https://nyc3.digitaloceanspaces.com');

export const s3Client = new S3({
    endpoint: spacesEndpoint.href,
    region: 'nyc3',
    credentials: {
        accessKeyId: process.env.SPACES_KEY || '',
        secretAccessKey: process.env.SPACES_SECRET || ''
    }
});

type FileType = 'translation' | 'knowledge';

export const uploadToSpaces = async (
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
                Bucket: process.env.SPACES_BUCKET || '',
                Key: `${folder}/${fileName}`,
                Body: fileBuffer,
                ACL: 'public-read',
                ContentType: determineContentType(fileName)
            }
        });

        await upload.done();
        console.log('✅ Upload concluído com sucesso');
        
        return `https://${process.env.SPACES_BUCKET}.${spacesEndpoint.host}/${folder}/${fileName}`;
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
        default:
            return 'application/octet-stream';
    }
};