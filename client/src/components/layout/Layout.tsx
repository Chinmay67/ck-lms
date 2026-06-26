import { type ReactNode } from 'react';
import Navbar from './Navbar';

interface LayoutProps {
  children: ReactNode;
  pageTitle?: string;
}

const Layout = ({ children, pageTitle = '' }: LayoutProps) => {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-screen">
      <Navbar pageTitle={pageTitle} />
      <main className="flex-1 overflow-y-auto">
        <div className="w-full px-5 py-6">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
