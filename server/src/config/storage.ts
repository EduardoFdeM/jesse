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

export const uploadToSpaces = async (fileBuffer: Buffer, fileName: string): Promise<string> => {
    const upload = new Upload({
        client: s3Client,
        params: {
            Bucket: process.env.SPACES_BUCKET || '',
            Key: `translations/${fileName}`,
            Body: fileBuffer,
            ACL: 'public-read',
            ContentType: 'application/pdf'
        }
    });

    await upload.done();
    return `https://${process.env.SPACES_BUCKET}.${spacesEndpoint.host}/translations/${fileName}`;
}; 