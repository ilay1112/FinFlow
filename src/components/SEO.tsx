import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  type?: string;
  name?: string;
  image?: string;
  url?: string;
}

export function SEO({
  title = 'FinFlow | ניהול הוצאות לעוסק פטור והפקת קבלות דיגיטליות',
  description = 'מערכת חכמה לניהול הוצאות לעוסק פטור, הפקת קבלות דיגיטליות ומעקב פיננסי לעסקים קטנים בישראל. הנתונים שלך נשמרים בטוחים ב-Google Drive.',
  type = 'website',
  name = 'FinFlow',
  image = '/og-image.jpg',
  url = 'https://finflow.app/'
}: SEOProps) {
  return (
    <Helmet>
      {/* Standard metadata tags */}
      <title>{title}</title>
      <meta name='description' content={description} />
      
      {/* Open Graph tags (Facebook, LinkedIn, etc.) */}
      <meta property='og:type' content={type} />
      <meta property='og:title' content={title} />
      <meta property='og:description' content={description} />
      <meta property='og:site_name' content={name} />
      <meta property='og:image' content={image} />
      <meta property='og:url' content={url} />
      
      {/* Twitter tags */}
      <meta name='twitter:creator' content={name} />
      <meta name='twitter:card' content='summary_large_image' />
      <meta name='twitter:title' content={title} />
      <meta name='twitter:description' content={description} />
      <meta name='twitter:image' content={image} />
    </Helmet>
  );
}
