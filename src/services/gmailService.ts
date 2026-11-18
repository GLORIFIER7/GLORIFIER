import { extractAngleBracketContent, stripBase64Padding } from '../lib/linear-string.js';
import { getAccessToken } from '../lib/firebase';
import { GmailAnalysisItem, GmailTelemetryMetadata } from '../types';

export interface GmailMessageHeader {
  name: string;
  value: string;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  snippet: string;
  sender: string;
  subject: string;
  date: string;
  labels: string[];
}

/**
 * Fetch list of message IDs from Gmail REST API
 */
export async function listGmailMessages(maxResults = 15, query = ''): Promise<{ messages: { id: string; threadId: string }[]; resultSizeEstimate: number }> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Gmail access token is not available. Please sign in with Google to grant access.');
  }

  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('maxResults', maxResults.toString());
  if (query) {
    url.searchParams.set('q', query);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gmail API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return {
    messages: data.messages || [],
    resultSizeEstimate: data.resultSizeEstimate || 0,
  };
}

/**
 * Fetch detailed message metadata by ID
 */
export async function getGmailMessage(messageId: string): Promise<GmailMessageSummary> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Gmail access token is missing.');
  }

  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch message ${messageId}: ${response.statusText}`);
  }

  const data = await response.json();
  const headers: GmailMessageHeader[] = data.payload?.headers || [];

  const getHeader = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  return {
    id: data.id,
    threadId: data.threadId,
    snippet: data.snippet || '',
    sender: getHeader('From'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    labels: data.labelIds || [],
  };
}

/**
 * Categorize Gmail metadata using local keyword heuristics only.
 * This function does not anonymize, tokenize, transform, license, or value email data.
 */
export function classifyEmailMetadataForGovernanceReview(msg: GmailMessageSummary): GmailAnalysisItem {
  const lowerSnippet = msg.snippet.toLowerCase();
  const lowerSender = msg.sender.toLowerCase();
  const lowerSubject = msg.subject.toLowerCase();

  let category: GmailAnalysisItem['category'] = 'Newsletter/Research';
  if (
    lowerSnippet.includes('order') || lowerSnippet.includes('receipt') ||
    lowerSnippet.includes('payment') || lowerSnippet.includes('total') ||
    lowerSubject.includes('order') || lowerSubject.includes('invoice') ||
    lowerSender.includes('store') || lowerSender.includes('amazon')
  ) {
    category = 'Receipt/Commerce';
  } else if (
    lowerSnippet.includes('flight') || lowerSnippet.includes('hotel') ||
    lowerSnippet.includes('booking') || lowerSnippet.includes('reservation') ||
    lowerSubject.includes('airline') || lowerSubject.includes('trip')
  ) {
    category = 'Travel/Itinerary';
  } else if (
    lowerSnippet.includes('invitation') || lowerSnippet.includes('calendar') ||
    lowerSnippet.includes('project') || lowerSubject.includes('sync') ||
    lowerSubject.includes('meeting')
  ) {
    category = 'Work/Collaboration';
  }

  const formattedDate = msg.date
    ? new Date(msg.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Date unavailable';
  const displaySender = extractAngleBracketContent(msg.sender) || msg.sender;

  return {
    id: msg.id,
    snippet: msg.snippet,
    sender: displaySender,
    date: formattedDate,
    category,
    extractedInsights: 'Local keyword category only. No anonymization, tokenization, differential privacy, zero-knowledge proof, licensing, or compensation was performed.',
    governanceAction: 'NOT VERIFIED — no privacy transformation applied',
    estimatedYieldUsd: null,
  };
}

/**
 * Send an email via Gmail API with mandatory explicit confirmation
 */
export async function sendGmailMessage(recipient: string, subject: string, bodyText: string): Promise<any> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('No access token available. Please sign in to Gmail.');
  }

  // UTF-8 email payload
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const messageParts = [
    `To: ${recipient}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: ${utf8Subject}`,
    '',
    bodyText,
  ];
  const message = messageParts.join('\r\n');

  // Base64URL encode
  const encodedMessage = stripBase64Padding(btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_'));

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodedMessage }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send email (${response.status}): ${errorText}`);
  }

  return await response.json();
}
