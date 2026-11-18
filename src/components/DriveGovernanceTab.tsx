import React, { useState, useEffect, useMemo } from 'react';
import { 
  HardDrive, 
  ShieldCheck, 
  ShieldAlert, 
  Lock, 
  RefreshCw, 
  Sparkles, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  FileText, 
  FileSpreadsheet, 
  Presentation, 
  FileCode, 
  FolderArchive,
  ExternalLink,
  EyeOff,
  UserCheck,
  Search,
  Share2,
  FilePlus2,
  Sliders,
  Database
} from 'lucide-react';
import { User } from 'firebase/auth';
import { getAccessToken } from '../lib/firebase';
import { 
  listDriveFiles, 
  classifyDriveMetadataForReview, 
  createDriveGovernanceManifest, 
  deleteDriveFile 
} from '../services/driveService';
import { DriveAnalysisItem } from '../types';

interface DriveGovernanceTabProps {
  currentUser: User | null;
  onLogin: () => void;
  onAddEarnings: (amountUsd: number, description: string) => void;
}

export const DriveGovernanceTab: React.FC<DriveGovernanceTabProps> = ({
  currentUser,
  onLogin,
}) => {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<DriveAnalysisItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<DriveAnalysisItem | null>(null);

  // Search and filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Confirmation Modals (MANDATORY per Workspace guidelines)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<DriveAnalysisItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  const [exportManifestConfirmOpen, setExportManifestConfirmOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportSuccessLink, setExportSuccessLink] = useState<{ name: string; link?: string } | null>(null);

  const hasAccessToken = !!getAccessToken();

  const fetchDriveFiles = async () => {
    if (!currentUser || !hasAccessToken) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { files: rawFiles } = await listDriveFiles(30);
      if (rawFiles.length === 0) {
        setFiles([]);
        setLoading(false);
        return;
      }

      const analyzed = rawFiles.map(classifyDriveMetadataForReview);
      setFiles(analyzed);


    } catch (err: any) {
      console.error('Failed to sync Drive:', err);
      setError(err.message || 'Error connecting to Google Drive. Please sign in again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && hasAccessToken && files.length === 0) {
      fetchDriveFiles();
    }
  }, [currentUser, hasAccessToken]);

  // Execute confirmed file deletion
  const handleExecuteDelete = async () => {
    if (!deleteConfirmTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteDriveFile(deleteConfirmTarget.id);
      const targetName = deleteConfirmTarget.name;
      setFiles(prev => prev.filter(f => f.id !== deleteConfirmTarget.id));
      if (selectedFile?.id === deleteConfirmTarget.id) {
        setSelectedFile(null);
      }
      setDeleteConfirmTarget(null);
      setDeleteSuccess(`Successfully deleted "${targetName}" from Google Drive.`);
    } catch (err: any) {
      setError(`Failed to delete file: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  // Execute confirmed manifest export
  const handleExecuteExportManifest = async () => {
    setExportManifestConfirmOpen(false);
    setExporting(true);
    setError(null);
    try {
      const manifestPayload = {
        title: 'Drive Metadata Review Manifest · NOT A COMPLIANCE CERTIFICATE',
        generatedAt: new Date().toISOString(),
        userEmail: currentUser?.email,
        totalFilesMetadataReviewed: files.length,
        heuristicHighRiskFlags: files.filter(f => f.leakRiskScore >= 70).length,
        privacyStandard: 'Configured privacy targets only; transformation and proof generation NOT VERIFIED',
        hypotheticalEstimatedValueMonthlyUsd: null,
        estimatedValueStatus: 'NOT ESTIMATED — no validated buyer quote or valuation model',
        filesMetadataReviewLog: files.map(f => ({
          name: f.name,
          category: f.category,
          riskScore: f.leakRiskScore,
          governanceAction: f.governanceAction,
          configuredPrivacyTarget: f.differentialPrivacyNoiseLevel,
          sharedExternal: f.shared,
        })),
        legalNotice: 'This manifest summarizes metadata review and configured settings. It does not certify CCPA/GDPR compliance, data de-identification, or privacy enforcement.',
      };

      const result = await createDriveGovernanceManifest(
        `Drive-Metadata-Review-Manifest-${Date.now().toString().slice(-4)}.json`,
        manifestPayload
      );

      setExportSuccessLink({ name: result.name, link: result.webViewLink });
      
      // Refresh list
      fetchDriveFiles();
    } catch (err: any) {
      setError(`Failed to export manifest: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  // Filtered files
  const filteredFiles = useMemo(() => {
    return files.filter(file => {
      const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (selectedCategory === 'all') return true;
      if (selectedCategory === 'spreadsheets' && file.category === 'Spreadsheets & Finance') return true;
      if (selectedCategory === 'documents' && file.category === 'Documents & Research') return true;
      if (selectedCategory === 'presentations' && file.category === 'Presentations & Strategy') return true;
      if (selectedCategory === 'code' && file.category === 'Code & Architecture') return true;
      if (selectedCategory === 'media' && file.category === 'Media & Creative') return true;
      return true;
    });
  }, [files, searchQuery, selectedCategory]);

  const getFileCategoryIcon = (category: DriveAnalysisItem['category']) => {
    switch (category) {
      case 'Spreadsheets & Finance':
        return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
      case 'Presentations & Strategy':
        return <Presentation className="w-4 h-4 text-amber-400" />;
      case 'Code & Architecture':
        return <FileCode className="w-4 h-4 text-cyan-400" />;
      case 'Media & Creative':
        return <FolderArchive className="w-4 h-4 text-purple-400" />;
      default:
        return <FileText className="w-4 h-4 text-blue-400" />;
    }
  };

  const highRiskCount = files.filter(f => f.leakRiskScore >= 70).length;
  const externalSharedCount = files.filter(f => f.shared).length;
  

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
                <HardDrive className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Google Drive Metadata Review · Monetization NOT VERIFIED
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                Drive API integration · live connection NOT VERIFIED
              </span>
            </div>
            <p className="text-sm text-slate-400 max-w-2xl">
              Review available Drive metadata for configured exposure indicators. This is a heuristic review, not a complete content scan. Data-flow isolation, privacy transformations, and monetization are NOT VERIFIED.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!currentUser || !hasAccessToken ? (
              <button
                onClick={onLogin}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
              >
                <UserCheck className="w-4 h-4" />
                <span>Connect & Authorize Drive</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchDriveFiles}
                  disabled={loading}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
                  <span>{loading ? 'Loading Drive metadata…' : 'Review File Metadata'}</span>
                </button>
                <button
                  onClick={() => setExportManifestConfirmOpen(true)}
                  disabled={exporting || files.length === 0}
                  className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-md transition-colors disabled:opacity-50"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  <span>{exporting ? 'Exporting…' : 'Save Metadata Review Manifest'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-800/80">
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Drive metadata records loaded</span>
            <div className="text-lg font-bold text-white font-mono mt-0.5">{files.length}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Valuation estimate · NOT AVAILABLE</span>
            <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
              NOT ESTIMATED
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Heuristic high-exposure flags</span>
            <div className={`text-lg font-bold font-mono mt-0.5 ${highRiskCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
              {highRiskCount} Files
            </div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">External Shared Links</span>
            <div className={`text-lg font-bold font-mono mt-0.5 ${externalSharedCount > 0 ? 'text-cyan-400' : 'text-slate-400'}`}>
              {externalSharedCount} Active
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button 
            onClick={onLogin} 
            className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-semibold"
          >
            Re-authorize
          </button>
        </div>
      )}

      {deleteSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{deleteSuccess}</span>
        </div>
      )}

      {exportSuccessLink && (
        <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>Created metadata review manifest: <strong>{exportSuccessLink.name}</strong></span>
          </div>
          {exportSuccessLink.link && (
            <a 
              href={exportSuccessLink.link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-3 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 font-semibold flex items-center gap-1.5"
            >
              <span>View in Google Drive</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}

      {/* Main Content Area */}
      {!currentUser || !hasAccessToken ? (
        <div className="p-12 rounded-2xl bg-slate-900/50 border border-slate-800 text-center space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Google Drive Access Authorization Required</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Connect your Google account to review available file metadata and Drive-reported sharing fields. This screen does not scan full file contents or apply privacy transformations.
            </p>
          </div>
          <button
            onClick={onLogin}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 inline-flex items-center gap-2"
          >
            <UserCheck className="w-4 h-4" />
            <span>Sign in with Google & Authorize Drive</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* File Analysis List */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search & Category Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter Drive files by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'spreadsheets', label: 'Finance/Sheets' },
                  { id: 'documents', label: 'Docs' },
                  { id: 'presentations', label: 'Slides' },
                  { id: 'code', label: 'Code' },
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      selectedCategory === cat.id
                        ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                        : 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {loading && files.length === 0 ? (
              <div className="p-8 rounded-xl bg-slate-900 border border-slate-800 text-center text-slate-400 text-xs">
                <RefreshCw className="w-5 h-5 mx-auto animate-spin text-cyan-400 mb-2" />
                Connecting to Google Drive API and analyzing file sensitivity vectors...
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="p-8 rounded-xl bg-slate-900 border border-slate-800 text-center text-slate-400 text-xs space-y-2">
                <HardDrive className="w-6 h-6 mx-auto text-slate-600" />
                <p>No matching Google Drive files found.</p>
                <button
                  onClick={fetchDriveFiles}
                  className="px-3 py-1.5 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 text-xs font-semibold"
                >
                  Refresh Drive Index
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredFiles.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => setSelectedFile(file)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        setSelectedFile(file);
                      }
                    }}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      selectedFile?.id === file.id
                        ? 'bg-slate-900 border-cyan-500/50 shadow-md ring-1 ring-cyan-500/20'
                        : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="p-1 rounded bg-slate-800">
                            {getFileCategoryIcon(file.category)}
                          </span>
                          <span className="text-xs font-bold text-white truncate max-w-[280px]">
                            {file.name}
                          </span>
                          {file.shared && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                              <Share2 className="w-3 h-3" />
                              <span>Shared Link</span>
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            {file.category}
                          </span>
                        </div>

                        {file.sensitiveSignals.length > 0 ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {file.sensitiveSignals.map((sig, idx) => (
                              <span 
                                key={idx} 
                                className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20"
                              >
                                {sig}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-400">
                            No configured risk pattern was detected in this metadata review. This does not prove that the file contains no sensitive information.
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-emerald-400 font-mono">
                          NOT ESTIMATED · NOT REVENUE
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {file.modifiedTime || 'Modification time unavailable'}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{file.governanceAction}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">Risk:</span>
                          <span 
                            className={`font-mono font-bold text-xs ${
                              file.leakRiskScore >= 70 ? 'text-rose-400' :
                              file.leakRiskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            {file.leakRiskScore}/100
                          </span>
                        </div>
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-slate-400 hover:text-cyan-400 transition-colors p-1"
                            title="Open in Google Drive"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Inspection & Action Panel */}
          <div className="space-y-4">
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>File Metadata Review · no privacy transformation or revenue verified</span>
              </h4>

              {selectedFile ? (
                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">File Name</span>
                    <span className="text-slate-200 font-medium mt-0.5 block break-all">{selectedFile.name}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Category</span>
                      <span className="text-cyan-400 font-semibold mt-0.5 block text-[11px] truncate">
                        {selectedFile.category}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Heuristic exposure score · not a security assessment</span>
                      <span className={`font-mono font-bold mt-0.5 block text-xs ${
                        selectedFile.leakRiskScore >= 70 ? 'text-rose-400' :
                        selectedFile.leakRiskScore >= 40 ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {selectedFile.leakRiskScore} / 100
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                      Privacy transform status · NOT VERIFIED
                    </span>
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-cyan-300 text-[11px] mt-1">
                      {selectedFile.differentialPrivacyNoiseLevel}
                    </div>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                      Heuristic exposure indicators
                    </span>
                    {selectedFile.sensitiveSignals.length > 0 ? (
                      <div className="mt-1 space-y-1">
                        {selectedFile.sensitiveSignals.map((sig, i) => (
                          <div key={i} className="p-2 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                            <span>{sig}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] flex items-center gap-1.5 mt-1">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>Local metadata scan: no configured PII patterns detected in the checked title/metadata. This is not a complete PII audit or privacy guarantee.</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 text-[10px] block uppercase font-bold">Valuation estimate · NOT AVAILABLE</span>
                      <span className="text-slate-400 text-[10px] block uppercase font-bold">Hypothetical estimated value · NOT REVENUE</span>
                      <span className="text-base font-bold text-emerald-400 font-mono">
                        NOT ESTIMATED — no validated valuation model
                      </span>
                    </div>

                    {selectedFile.webViewLink && (
                      <a
                        href={selectedFile.webViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {/* Mutating Action: Delete File (With MANDATORY confirmation dialog) */}
                  <div className="pt-3 border-t border-slate-800">
                    <button
                      onClick={() => setDeleteConfirmTarget(selectedFile)}
                      className="w-full px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      <span>Delete File from Drive</span>
                    </button>
                    <p className="text-[10px] text-slate-500 text-center mt-1.5">
                      Deletes the selected file from the connected Drive account if the provider accepts the request. It cannot revoke copies already downloaded or shared elsewhere. Requires confirmation.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs space-y-2">
                  <EyeOff className="w-6 h-6 mx-auto text-slate-600" />
                  <p>Select a cloud file to view available sensitivity analysis. Cryptographic protections and actual data flow are NOT VERIFIED by this screen.</p>
                </div>
              )}
            </div>

            {/* Zero-Knowledge Guarantees */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 space-y-2">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Drive Data Handling · NOT VERIFIED</span>
              </span>
              <p>
                Do not assume files stay in the browser or that only statistical indices are processed. Actual upload, processing, and provider data flows depend on the active integration and are NOT VERIFIED by this panel.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MANDATORY Explicit Confirmation Dialog for Deleting Drive File */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-rose-500/30 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Delete File from Google Drive</h3>
                <p className="text-xs text-slate-400">Explicit User Authorization Required</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
              <div>
                <span className="text-slate-500 text-[10px] block uppercase font-bold">File Name</span>
                <span className="text-slate-200 font-medium break-all">{deleteConfirmTarget.name}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block uppercase font-bold">File Category</span>
                <span className="text-slate-300">{deleteConfirmTarget.category}</span>
              </div>
              <p className="text-[11px] text-rose-300/80 pt-1">
                Are you sure you want to permanently delete this file from your Google Drive? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmTarget(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-bold shadow-md flex items-center gap-1.5"
              >
                {deleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete from Drive</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANDATORY Explicit Confirmation Dialog for Exporting Audit Manifest to Drive */}
      {exportManifestConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-cyan-500/30 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                <FilePlus2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Save Governance Audit to Drive</h3>
                <p className="text-xs text-slate-400">Explicit User Authorization Required</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
              <p className="text-slate-300 text-xs">
                This will create a structured audit manifest file:
              </p>
              <div className="p-2 rounded bg-slate-900 font-mono text-[11px] text-cyan-300">
                DataSovereign-Audit-Manifest.json
              </div>
              <p className="text-[11px] text-slate-400">
                The manifest records the selected governance settings and available scan results. It does not certify CCPA/GDPR compliance or prove zero-knowledge protections. Google Drive storage success and access controls depend on the active integration.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setExportManifestConfirmOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteExportManifest}
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow-md"
              >
                Confirm & Create in Drive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
