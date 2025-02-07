import { Server } from 'socket.io';

declare global {
    var io: Server | undefined;
}

export {};

// Não é necessário exportar nada em arquivos de declaração 