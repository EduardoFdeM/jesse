import { parse } from 'papaparse';
import { GlossaryEntry } from '../types';


export async function parseGlossaryFile(file: File): Promise<GlossaryEntry[]> {
  return new Promise((resolve, reject) => {
    parse(file, {
      complete: (results) => {
        if (!results.data || results.errors.length > 0) {
          return reject(new Error('Invalid CSV format'));
        }

        const entries: GlossaryEntry[] = results.data.map((row: any) => ({
          id: Math.random().toString(36).substr(2, 9),
          sourceText: row.sourceText || '',
          targetText: row.targetText || '',
          context: row.context || null,
          category: row.category || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        resolve(entries);
      },
      header: true,
      skipEmptyLines: true,
      error: (error) => {
        reject(new Error('Failed to parse CSV file: ' + error.message));
      },
    });
  });
}
