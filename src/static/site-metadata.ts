interface ISiteMetadataResult {
  siteTitle: string;
  siteUrl: string;
  description: string;
  logo: string;
  navLinks: {
    name: string;
    url: string;
  }[];
}

const data: ISiteMetadataResult = {
  siteTitle: 'Running Page',
  siteUrl: 'https://xmchxup.github.io/running_page/',
  logo: 'https://avatars.githubusercontent.com/u/39235427?v=4',
  description: 'Running Page',
  navLinks: [
    {
      name: 'Blog',
      url: 'https://xmchx.vercel.app',
    },
    {
      name: 'About',
      url: 'https://xmchx.vercel.app/post/about',
    },
  ],
};

export default data;
