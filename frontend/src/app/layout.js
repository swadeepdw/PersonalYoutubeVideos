import './globals.css';

export const metadata = {
  title: 'Private YouTube App',
  description: 'View your uploaded YouTube videos in a private dashboard'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
