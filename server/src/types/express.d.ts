import { Request } from 'express';

declare global {
    namespace Express {
        // User in Request
        interface User {
            id: string;
            email: string;
            name: string;
            role: UserRole;
        }

        // Request Types
        interface Request {
            user?: User;
        }

        interface AuthenticatedRequest extends Request {
            user: User;
        }

        interface FileRequest extends Request {
            file?: Express.Multer.File;
            files?: Express.Multer.File[];
        }

        // Response Types
        interface TypedResponse<T> extends Express.Response {
            json: (body: ApiResponse<T>) => this;
        }

        // Multer File Type
        namespace Multer {
            interface File {
                fieldname: string;
                originalname: string;
                encoding: string;
                mimetype: string;
                size: number;
                destination: string;
                filename: string;
                path: string;
                buffer: Buffer;
            }
        }
    }
}

export {};
