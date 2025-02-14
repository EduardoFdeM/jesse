import { encoding_for_model } from 'tiktoken';

export const countTokens = async (text: string): Promise<number> => {
    const encoder = encoding_for_model('gpt-4');
    const tokens = encoder.encode(text);
    encoder.free();
    return tokens.length;
}; 