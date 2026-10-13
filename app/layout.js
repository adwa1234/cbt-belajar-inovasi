// app/layout.js
export const metadata = {
  title: 'MIN 1 MANGGARAI TIMUR - CBT',
  description: 'Aplikasi CBT Berbasis Next.js',
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  )
}
