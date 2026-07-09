import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query'
import { AppShell } from '@/components/layout/AppShell'
import { BrowsePage } from '@/pages/BrowsePage'
import { CachePage } from '@/pages/CachePage'
import { ComparePage } from '@/pages/ComparePage'
import { DownloadsPage } from '@/pages/DownloadsPage'
import { FavoritesPage } from '@/pages/FavoritesPage'
import { InboxPage } from '@/pages/InboxPage'
import { PapersPage } from '@/pages/PapersPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { UploadPage } from '@/pages/UploadPage'

export function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/models" replace />} />
            <Route path="models/*" element={<BrowsePage kind="model" />} />
            <Route path="datasets/*" element={<BrowsePage kind="dataset" />} />
            <Route path="spaces/*" element={<BrowsePage kind="space" />} />
            <Route path="papers/*" element={<PapersPage />} />
            <Route path="favorites" element={<FavoritesPage />} />
            <Route path="downloads" element={<DownloadsPage />} />
            <Route path="cache" element={<CachePage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="compare" element={<ComparePage />} />
            <Route path="upload" element={<UploadPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/models" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}
