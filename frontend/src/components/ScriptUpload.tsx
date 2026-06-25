import { useRef, type ReactNode } from 'react';

interface ScriptUploadProps {
  onUpload: (file: File) => void;
  accept?: string;
  children: ReactNode;
}

/** Wraps a trigger element with a hidden file input that calls onUpload. */
export function ScriptUpload({ onUpload, accept = '.md,text/markdown,text/plain', children }: ScriptUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className="contents">
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = '';
        }}
      />
      <span className="contents" onClick={() => input.current?.click()}>
        {children}
      </span>
    </span>
  );
}

export default ScriptUpload;
