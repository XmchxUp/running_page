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

const getBasePath = () => {
  const baseUrl = import.meta.env.BASE_URL;
  return baseUrl === '/' ? '' : baseUrl;
};

const data: ISiteMetadataResult = {
  siteTitle: 'Running Page',
  siteUrl: 'https://xmchxup.github.io/running_page/',
  logo: 'https://avatars.githubusercontent.com/u/39235427?v=4',
  description: 'Personal site and blog',
  navLinks: [
    {
      name: 'Running Page',
      url: `${getBasePath()}/`,
    },
    {
      name: 'Summary',
      url: `${getBasePath()}/summary`,
    },
    {
      name: 'Workouts',
      url: `${getBasePath()}/workouts`,
    },
    {
      name: 'Blog',
      url: 'https://xmchx.vercel.app/',
    },
  ],
};

export default data;
