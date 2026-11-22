import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, FileCode2, FolderTree, Search } from 'lucide-react';
import { apiRequest, formatBytes } from '../api';
import type { ProjectSourceFile } from '../types';

export function SourceExplorer() {
  const [files, setFiles] = useState<ProjectSourceFile[]>([]);
  const [groupFilter, setGroupFilter] = useState<'all' | 'android' | 'backend-fastapi' | 'docs'>('all');
  const [search, setSearch] = useState('');
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ files: ProjectSourceFile[] }>('/api/project/files')
      .then((res) => {
        if (!active) return;
        setFiles(res.files);
        const preferred =
          res.files.find((f) => f.path.endsWith('MainActivity.kt')) ||
          res.files[0];
        if (preferred) {
          setSelectedPath(preferred.path);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load source tree');
      })
      .finally(() => {
        if (active) setLoadingList(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedPath) return;
    let active = true;
    setLoadingFile(true);
    setError(null);
    apiRequest<{ path: string; content: string }>(
      `/api/project/file?path=${encodeURIComponent(selectedPath)}`
    )
      .then((res) => {
        if (active) setFileContent(res.content);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to read file');
      })
      .finally(() => {
        if (active) setLoadingFile(false);
      });
    return () => {
      active = false;
    };
  }, [selectedPath]);

  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      if (groupFilter !== 'all' && f.group !== groupFilter) return false;
      if (search.trim() && !f.path.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [files, groupFilter, search]);

  const handleCopy = async () => {
    if (!fileContent) return;
    try {
      await navigator.clipboard.writeText(fileContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard restricted
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-[#1E252F] pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#E6ECF2]">
            Android Studio, FastAPI &amp; Deployment Source
          </h1>
          <p className="mt-1 text-sm text-[#8B97A5] max-w-2xl">
            Complete Kotlin Jetpack Compose Android module, standalone FastAPI reference backend, and APK signing documentation stored in this repository.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#101419] border border-[#1E252F] rounded-lg self-start">
          {(
            [
              ['all', 'All Files'],
              ['android', 'Android Studio'],
              ['backend-fastapi', 'FastAPI'],
              ['docs', 'Setup & Signing'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setGroupFilter(id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                groupFilter === id
                  ? 'bg-[#1D2530] text-[#39FF14]'
                  : 'text-[#8B97A5] hover:text-[#E6ECF2]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="border border-red-500/40 bg-red-950/30 px-4 py-3 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-4 border border-[#1E252F] bg-[#0D1116] rounded-lg overflow-hidden">
          <div className="p-3 border-b border-[#1E252F] flex items-center gap-2">
            <Search className="w-4 h-4 text-[#6B7785] shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter source files..."
              className="w-full bg-transparent text-sm text-[#E6ECF2] placeholder-[#5F6C7B] focus:outline-none"
            />
          </div>

          <div className="max-h-[620px] overflow-y-auto divide-y divide-[#171D25]">
            {loadingList ? (
              <div className="p-4 text-sm text-[#6B7785]">Loading repository tree...</div>
            ) : filteredFiles.length === 0 ? (
              <div className="p-4 text-sm text-[#6B7785]">No matching source files.</div>
            ) : (
              filteredFiles.map((file) => {
                const fileName = file.path.split('/').pop() || file.path;
                const dirPath = file.path.slice(0, file.path.length - fileName.length);
                const isSelected = file.path === selectedPath;
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelectedPath(file.path)}
                    className={`w-full text-left px-3.5 py-2.5 transition-colors flex items-start justify-between gap-2 cursor-pointer ${
                      isSelected ? 'bg-[#171E27] text-[#E6ECF2]' : 'text-[#9BA6B4] hover:bg-[#12171E]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileCode2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isSelected ? 'text-[#39FF14]' : 'text-[#6B7785]'
                          }`}
                        />
                        <span className="text-sm font-medium truncate">{fileName}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-[#616D7B] truncate font-mono">
                        {dirPath}
                      </div>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-[#616D7B] shrink-0">
                      {formatBytes(file.size)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="lg:col-span-8 border border-[#1E252F] bg-[#0D1116] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1E252F] flex items-center justify-between gap-3 bg-[#10151C]">
            <div className="flex items-center gap-2 min-w-0">
              <FolderTree className="w-4 h-4 text-[#8B97A5] shrink-0" />
              <span className="text-xs font-mono text-[#C8D0D8] truncate">
                {selectedPath || 'Select a file to inspect'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!fileContent}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#26303D] bg-[#151C24] text-[#C8D0D8] hover:text-[#39FF14] hover:border-[#39FF14]/50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#39FF14]" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Source'}
            </button>
          </div>

          <div className="max-h-[620px] overflow-auto p-4 bg-[#090C10]">
            {loadingFile ? (
              <div className="text-sm text-[#6B7785]">Reading file contents...</div>
            ) : (
              <pre className="text-xs leading-relaxed font-mono text-[#C8D0D8] whitespace-pre overflow-x-auto">
                <code>{fileContent}</code>
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
