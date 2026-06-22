import { useState } from 'react';
import { BookOpen, Film, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilmApp } from '@/FilmApp';
import { ComicsApp } from '@/ComicsApp';
import { cn } from '@/lib/utils';

type Medium = 'films' | 'comics';

export function App() {
  const [medium, setMedium] = useState<Medium>('films');

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 font-bold">
            {medium === 'films' ? (
              <Film className="h-5 w-5" />
            ) : (
              <BookOpen className="h-5 w-5" />
            )}
            {medium === 'films' ? 'MovieGen' : 'ComicsGen'}
          </div>
          <div className="inline-flex rounded-md border p-0.5">
            <button
              type="button"
              onClick={() => setMedium('films')}
              className={cn(
                'flex items-center gap-1 rounded px-3 py-1 text-sm font-medium',
                medium === 'films'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Film className="h-4 w-4" /> Films
            </button>
            <button
              type="button"
              onClick={() => setMedium('comics')}
              className={cn(
                'flex items-center gap-1 rounded px-3 py-1 text-sm font-medium',
                medium === 'comics'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <BookOpen className="h-4 w-4" /> Comics
            </button>
          </div>
        </div>
        <Button variant="ghost" size="icon" title="Settings">
          <Settings className="h-5 w-5" />
        </Button>
      </header>

      <div className="p-4">
        {medium === 'films' ? <FilmApp /> : <ComicsApp />}
      </div>
    </div>
  );
}

export default App;
