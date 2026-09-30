'use client';

import SubscribeForm from '../../newsletter/_components/subscribe-form';

// Site-wide footer subscribe block (mounted on public pages).
export default function SiteFooter() {
  return (
    <footer>
      <SubscribeForm source="footer" />
    </footer>
  );
}
