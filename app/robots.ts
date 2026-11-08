import type {MetadataRoute} from 'next';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/admin/','/api/','/order','/pesanan','/lacak','/undangan-admin','/akses-tim']},sitemap:'https://elitevtg.com/sitemap.xml'};}
