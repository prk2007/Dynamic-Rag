import { load } from 'cheerio';
import type { DocumentType } from '../models/document.js';

/**
 * Parsed document result
 */
export interface ParsedDocument {
  content: string;
  metadata: {
    pageCount?: number;
    characterCount: number;
    wordCount: number;
    title?: string;
    author?: string;
  };
}

/**
 * PDF Parser
 * Extracts text content from PDF files
 */
export class PDFParser {
  async parse(buffer: Buffer): Promise<ParsedDocument> {
    try {
      // Lazy load pdf-parse to avoid its startup issue
      const pdf = (await import('pdf-parse')).default;
      const data = await pdf(buffer);

      return {
        content: data.text,
        metadata: {
          pageCount: data.numpages,
          characterCount: data.text.length,
          wordCount: data.text.split(/\s+/).filter(Boolean).length,
          title: data.info?.Title,
          author: data.info?.Author,
        },
      };
    } catch (error) {
      console.error('PDF parsing error:', error);
      throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * HTML Parser
 * Extracts text content from HTML files and web pages
 */
export class HTMLParser {
  async parse(buffer: Buffer): Promise<ParsedDocument> {
    try {
      const html = buffer.toString('utf-8');
      const $ = load(html);

      // Remove script and style elements
      $('script, style, noscript').remove();

      // Extract title
      const title = $('title').text().trim() || undefined;

      // Extract main content
      // Prefer main, article, or body content
      let content = '';
      if ($('main').length > 0) {
        content = $('main').text();
      } else if ($('article').length > 0) {
        content = $('article').text();
      } else {
        content = $('body').text();
      }

      // Clean up whitespace
      content = content
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim();

      return {
        content,
        metadata: {
          characterCount: content.length,
          wordCount: content.split(/\s+/).filter(Boolean).length,
          title,
        },
      };
    } catch (error) {
      console.error('HTML parsing error:', error);
      throw new Error(`Failed to parse HTML: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Text Parser
 * Handles plain text and markdown files
 */
export class TextParser {
  async parse(buffer: Buffer): Promise<ParsedDocument> {
    try {
      const content = buffer.toString('utf-8');

      // Extract title from markdown (first # heading)
      let title: string | undefined;
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }

      return {
        content,
        metadata: {
          characterCount: content.length,
          wordCount: content.split(/\s+/).filter(Boolean).length,
          title,
        },
      };
    } catch (error) {
      console.error('Text parsing error:', error);
      throw new Error(`Failed to parse text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Document Parser Factory
 * Returns appropriate parser based on document type
 */
export class DocumentParser {
  private pdfParser = new PDFParser();
  private htmlParser = new HTMLParser();
  private textParser = new TextParser();

  async parse(buffer: Buffer, docType: DocumentType): Promise<ParsedDocument> {
    switch (docType) {
      case 'pdf':
        return this.pdfParser.parse(buffer);

      case 'html':
        return this.htmlParser.parse(buffer);

      case 'txt':
      case 'md':
        return this.textParser.parse(buffer);

      default:
        throw new Error(`Unsupported document type: ${docType}`);
    }
  }

  /**
   * Detect document type from filename
   */
  static detectType(filename: string): DocumentType | null {
    const ext = filename.toLowerCase().split('.').pop();

    switch (ext) {
      case 'pdf':
        return 'pdf';
      case 'html':
      case 'htm':
        return 'html';
      case 'txt':
        return 'txt';
      case 'md':
      case 'markdown':
        return 'md';
      default:
        return null;
    }
  }

  /**
   * Get MIME type for document type
   */
  static getMimeType(docType: DocumentType): string {
    switch (docType) {
      case 'pdf':
        return 'application/pdf';
      case 'html':
        return 'text/html';
      case 'txt':
        return 'text/plain';
      case 'md':
        return 'text/markdown';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Validate file size
   */
  static validateSize(sizeBytes: number, maxSizeMB: number): boolean {
    const maxBytes = maxSizeMB * 1024 * 1024;
    return sizeBytes <= maxBytes;
  }

  /**
   * Validate document type
   */
  static validateType(
    docType: DocumentType,
    allowedTypes: DocumentType[]
  ): boolean {
    return allowedTypes.includes(docType);
  }
}

// Export singleton instance
export const documentParser = new DocumentParser();
