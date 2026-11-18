import { getAccessToken } from '../lib/firebase';
import { DriveAnalysisItem } from '../types';

export interface DriveApiFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  shared?: boolean;
  webViewLink?: string;
  iconLink?: string;
  description?: string;
}

export interface ListDriveFilesResult {
  files: DriveApiFile[];
  nextPageToken?: string;
}

/**
 * Fetch files from Google Drive v3 REST API
 */
export async function listDriveFiles(pageSize = 25, query = ''): Promise<ListDriveFilesResult> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Google Drive access token is not available. Please sign in with Google to grant access.');
  }

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('pageSize', pageSize.toString());
  url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,shared,webViewLink,iconLink,description)');
  url.searchParams.set('orderBy', 'modifiedTime desc');
  
  // Exclude trashed files by default
  const qParts = ['trashed = false'];
  if (query.trim()) {
    qParts.push(query);
  }
  url.searchParams.set('q', qParts.join(' and '));

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Drive API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return {
    files: data.files || [],
    nextPageToken: data.nextPageToken,
  };
}

/**
 * Metadata-only heuristic classification. This does not read file contents, apply privacy transformations, or estimate revenue.
 */
export function classifyDriveMetadataForReview(file: DriveApiFile): DriveAnalysisItem {
  const nameLower = file.name.toLowerCase();
  const mime = file.mimeType.toLowerCase();
  let category: DriveAnalysisItem['category'] = 'Documents & Research';
  let baseRisk = 20;
  const sensitiveSignals: string[] = [];

  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv') || nameLower.endsWith('.csv') || nameLower.endsWith('.xlsx')) {
    category = 'Spreadsheets & Finance';
    baseRisk = 45;
  } else if (mime.includes('presentation') || mime.includes('powerpoint') || nameLower.endsWith('.pptx') || nameLower.endsWith('.key')) {
    category = 'Presentations & Strategy';
    baseRisk = 30;
  } else if (mime.includes('json') || mime.includes('javascript') || mime.includes('python') || mime.includes('zip') || mime.includes('tar') || nameLower.endsWith('.py') || nameLower.endsWith('.ts') || nameLower.endsWith('.zip')) {
    category = 'Code & Architecture';
    baseRisk = 35;
  } else if (mime.includes('image') || mime.includes('video') || mime.includes('audio') || mime.includes('photoshop')) {
    category = 'Media & Creative';
    baseRisk = 15;
  } else if (mime.includes('folder')) {
    category = 'Archival & Other';
    baseRisk = 10;
  }

  const sensitiveKeywords = [
    { word: 'tax', signal: 'Filename contains tax-related keyword' },
    { word: 'invoice', signal: 'Filename contains invoice-related keyword' },
    { word: 'receipt', signal: 'Filename contains receipt-related keyword' },
    { word: 'passport', signal: 'Filename contains identity-document keyword' },
    { word: 'license', signal: 'Filename contains license-related keyword' },
    { word: 'contract', signal: 'Filename contains contract-related keyword' },
    { word: 'salary', signal: 'Filename contains salary-related keyword' },
    { word: 'budget', signal: 'Filename contains budget-related keyword' },
    { word: 'statement', signal: 'Filename contains statement-related keyword' },
    { word: 'confidential', signal: 'Filename contains confidentiality keyword' },
    { word: 'secret', signal: 'Filename contains secret-related keyword' },
    { word: 'resume', signal: 'Filename contains resume-related keyword' },
    { word: 'medical', signal: 'Filename contains medical-related keyword' },
  ];

  for (const item of sensitiveKeywords) {
    if (nameLower.includes(item.word)) {
      sensitiveSignals.push(item.signal);
      baseRisk += 25;
    }
  }
  if (file.shared) {
    sensitiveSignals.push('Drive API reports sharing enabled; audience/scope not independently checked');
    baseRisk += 20;
  }

  const heuristicRisk = Math.min(Math.max(baseRisk, 12), 98);
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.size ? Number.parseInt(file.size, 10) : undefined,
    createdTime: file.createdTime ? new Date(file.createdTime).toLocaleDateString() : undefined,
    modifiedTime: file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : undefined,
    shared: !!file.shared,
    webViewLink: file.webViewLink,
    iconLink: file.iconLink,
    category,
    leakRiskScore: heuristicRisk,
    sensitiveSignals,
    governanceAction: 'NOT VERIFIED — no privacy transformation applied',
    estimatedYieldUsd: null,
    differentialPrivacyNoiseLevel: 'NOT APPLIED — no verified privacy transform',
  };
}

/**
 * Creates a Data Sovereignty Governance Manifest file directly in user's Google Drive.
 * MANDATORY: Call this only after explicit user confirmation dialog!
 */
export async function createDriveGovernanceManifest(
  fileName: string,
  manifestData: Record<string, any>
): Promise<{ id: string; name: string; webViewLink?: string }> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Google Drive access token missing.');
  }

  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    description: 'Drive metadata review manifest; not a compliance certificate or cryptographic verification proof.',
  };

  const content = JSON.stringify(manifestData, null, 2);
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    content +
    closeDelimiter;

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload manifest to Drive: ${errorText}`);
  }

  return await response.json();
}

/**
 * Deletes a file from Google Drive.
 * MANDATORY: Call this only after explicit user confirmation dialog!
 */
export async function deleteDriveFile(fileId: string): Promise<void> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Google Drive access token missing.');
  }

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok && response.status !== 204) {
    const errorText = await response.text();
    throw new Error(`Failed to delete Drive file: ${errorText}`);
  }
}
