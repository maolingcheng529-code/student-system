import type { Metadata } from 'next';
export const metadata: Metadata = { title: '知序 · 人工智能概论', description: '按章节探索知识，保存自己的学习记录。' };
export default function RootLayout({children}: {children: React.ReactNode}) {
  return <html lang="zh-CN"><head><meta name="theme-color" content="#153f35"/><link rel="stylesheet" href="/style.css"/><link rel="stylesheet" href="/account.css"/><link rel="stylesheet" href="/course.css"/><link rel="stylesheet" href="/textbook.css"/><link rel="stylesheet" href="/learning.css"/></head><body>{children}</body></html>;
}
