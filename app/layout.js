// app/layout.js
export const metadata = {
  title: 'BELAJAR INOVASI - CBT',
  description: 'Aplikasi CBT Berbasis Next.js',
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
