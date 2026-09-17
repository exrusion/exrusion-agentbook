/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() { return [{source:'/:path*',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'DENY'}]},{source:'/manage/:path*',headers:[{key:'Cache-Control',value:'private, no-store'},{key:'X-Robots-Tag',value:'noindex, nofollow'}]},{source:'/api/manage/:path*',headers:[{key:'Cache-Control',value:'private, no-store'}]}]; }
};

export default nextConfig;
