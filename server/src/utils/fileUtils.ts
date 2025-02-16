import { s3Client } from '../config/storage.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { streamToBuffer } from './streamToBuffer.js';
import path from 'path';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export const extractFileContent = async (filePath: string): Promise<string> => {
    const s3Response = await s3Client.send(
        new GetObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET || '',
            Key: filePath.replace(`https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/`, '')
        })
    );

    const fileBuffer = await streamToBuffer(s3Response.Body as Readable);
    const fileExtension = path.extname(filePath).toLowerCase();

    let content = '';
    if (fileExtension === '.pdf') {
        const data = await pdf(fileBuffer);
        content = data.text;
    } else if (fileExtension === '.docx') {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        content = result.value;
    } else {
        content = fileBuffer.toString('utf-8');
    }

    return content
        .replace(/\r\n/g, '\n')
        .replace(/\s+/g, ' ')
        .trim();
};

export const generateTranslatedFileName = (originalName: string): string => {
    const timestamp = Date.now();
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension);
    return `translated_${baseName}_${timestamp}${extension}`;
}; 

export default extractFileContent; 


