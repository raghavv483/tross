/**
 * Apify Actor output for `harvestapi/linkedin-profile-scraper`.
 *
 * PROVENANCE: captured from a live harvestapi/linkedin-profile-scraper run.
 * This is ground truth - the mapper and the core-field guard are verified
 * against this exact object, not against a described shape.
 *
 * Trimmed only where a section is large, repetitive and explicitly NOT mapped
 * (`moreProfiles`, `interests`, `featured` keep one representative element
 * each rather than twenty). Every field the mapper reads is verbatim.
 */

const GDG_LOGO =
  'https://media.licdn.com/dms/image/v2/C560BAQGSjb9vychwxQ/company-logo_400_400/company-logo_400_400/0/1634544172610?e=1789603200&v=beta&t=MujuzorzLEhvlN5vYIfyRk0kD6mti2-ngrmjVB_t2X4';

const LNMIIT_LOGO =
  'https://media.licdn.com/dms/image/v2/D4D0BAQHn7jfCd8lURw/company-logo_400_400/company-logo_400_400/0/1686635689100/lnmiitjpr_logo?e=1789603200&v=beta&t=j3H_QgLrSf8dJ7U6aM2ZsqVQiihLHRZixl9bWAWP2uE';

const PHOTO_800 =
  'https://media.licdn.com/dms/image/v2/D5603AQFQDfu_o532Ig/profile-displayphoto-shrink_800_800/B56ZQ_5oDHGQAc-/0/1736238893981?e=1789603200&v=beta&t=6HeHvsxSVYE8JRgDoEI6l1VftBy145h80kqVEjPUnkw';
const PHOTO_400 =
  'https://media.licdn.com/dms/image/v2/D5603AQFQDfu_o532Ig/profile-displayphoto-shrink_400_400/B56ZQ_5oDHGQAg-/0/1736238893967?e=1789603200&v=beta&t=--2zZewJYYE1EMPcA8WEsy3UHgaG5PYEkQaKJQjRJfQ';
const PHOTO_200 =
  'https://media.licdn.com/dms/image/v2/D5603AQFQDfu_o532Ig/profile-displayphoto-shrink_200_200/B56ZQ_5oDHGQAY-/0/1736238893967?e=1789603200&v=beta&t=rzfEHTDEi3VkvuVcXwJq6am5rM_zvhNatq65x6Neu7M';
const PHOTO_100 =
  'https://media.licdn.com/dms/image/v2/D5603AQFQDfu_o532Ig/profile-displayphoto-shrink_100_100/B56ZQ_5oDHGQAU-/0/1736238893967?e=1789603200&v=beta&t=4y2E9XTSMMaNyQfUTBEwzShyttOw8vYjY7j-OTqjZO0';

/** The four profile-picture renditions, in the order the provider returns them. */
export const PROFILE_PICTURE_SIZES = [
  { url: PHOTO_800, width: 800, height: 800 },
  { url: PHOTO_400, width: 400, height: 400 },
  { url: PHOTO_200, width: 200, height: 200 },
  { url: PHOTO_100, width: 100, height: 100 },
];

/** The dataset item as returned. */
export const apifyProfileItem: Record<string, unknown> = {
  id: 'ACoAAEmKNK0BVhb0cbIFgQ4KiVwrzUv4p6xLo94',
  publicIdentifier: 'raghav-khandelwal-3512412a5',
  linkedinUrl: 'https://www.linkedin.com/in/raghav-khandelwal-3512412a5',
  firstName: 'Raghav',
  lastName: 'khandelwal',
  emails: [],
  headline:
    'Full-Stack Developer | AI/RAG Systems & Microservices | Next.js, Node.js, Docker, LangGraph',
  openToWork: false,
  hiring: false,
  premium: true,
  influencer: false,
  memorialized: false,
  creator: false,
  location: {
    linkedinText: 'Bharatpur, Rajasthan, India',
    countryCode: 'IN',
    parsed: {
      text: 'Bharatpur, India',
      countryCode: 'IN',
      regionCode: null,
      country: 'India',
      countryFull: 'India',
      state: 'Rajasthan',
      city: 'Bharatpur',
    },
  },
  objectUrn: '1233794221',
  registeredAt: '2023-12-17T13:24:02.057Z',
  topSkills: ['C++', 'Software Design', 'MERN Stack', 'Amazon Web Services (AWS)', 'Docker'],
  connectionsCount: 1247,
  followerCount: 1253,
  verified: true,
  about:
    'As a Bachelor of Technology candidate in Computer and Communication Engineering at The LNM Institute of Information Technology, I actively contribute as a Member of Google Developer Groups on Campus, leveraging my skills in Node.js, MongoDB, and Tailwind CSS. My internship at Divya Laxmi Pvt Ltd allowed me to optimize backend processes, reduce database latency, and implement secure API solutions through Node.js and Express.js. With a strong foundation in backend development and a passion for creating efficient workflows, I bring a collaborative and solution-focused approach to every project.',
  currentPosition: [
    {
      position: 'Member',
      location: 'Jaipur, Rajasthan, India',
      companyName: 'Google Developer Groups on Campus - LNMIIT',
      startDate: { month: 'Sep', year: 2024, text: 'Sep 2024' },
      endDate: { text: 'Present' },
    },
  ],
  profileTopEducation: [
    {
      schoolName: 'The LNM Institute of Information Technology',
      degree: 'Bachelor of Technology',
      fieldOfStudy: 'CCE',
      period: '2023 - 2027',
      startDate: { year: 2023, text: '2023' },
      endDate: { year: 2027, text: '2027' },
    },
  ],
  profileActions: [
    { label: 'View my portfolio', url: 'https://personal-portfolio-seven-alpha-77.vercel.app/' },
  ],
  profilePicture: {
    url: PHOTO_800,
    sizes: PROFILE_PICTURE_SIZES,
  },
  coverPicture: null,
  photo: PHOTO_800,
  profileLocales: [{ country: 'US', language: 'en' }],
  primaryLocale: { country: 'US', language: 'en' },
  services: null,
  experience: [
    {
      position: 'Member',
      location: 'Jaipur, Rajasthan, India',
      employmentType: 'Full-time',
      workplaceType: 'On-site',
      companyName: 'Google Developer Groups on Campus - LNMIIT',
      companyLinkedinUrl: 'https://www.linkedin.com/company/gdg-lnmiit-jaipur/',
      companyId: '76265271',
      duration: '2 yrs',
      description: null,
      skills: ['Web Development'],
      startDate: { month: 'Sep', year: 2024, text: 'Sep 2024' },
      endDate: { text: 'Present' },
      companyLogo: { url: GDG_LOGO, sizes: [{ url: GDG_LOGO, width: 400, height: 400 }] },
      companyUniversalName: 'gdg-lnmiit-jaipur',
    },
    {
      position: 'Student',
      location: 'Jaipur, Rajasthan, India',
      employmentType: 'Full-time',
      workplaceType: 'On-site',
      companyName: 'The LNM Institute of Information Technology',
      companyLinkedinUrl: 'https://www.linkedin.com/company/15132857/',
      companyId: '15132857',
      duration: '3 yrs 8 mos',
      description: null,
      skills: null,
      experienceGroupId: '8c96de85fb452530bba3d1c86877799577610a33',
      startDate: { year: 2023, text: '2023' },
      endDate: { text: 'Present' },
      companyLogo: { url: LNMIIT_LOGO, sizes: [{ url: LNMIIT_LOGO, width: 400, height: 400 }] },
    },
    {
      position: 'Finance Convener ',
      location: null,
      employmentType: 'Full-time',
      workplaceType: null,
      companyName: 'The LNM Institute of Information Technology',
      companyLinkedinUrl: 'https://www.linkedin.com/company/15132857/',
      companyId: '15132857',
      duration: '8 mos',
      description: null,
      skills: null,
      experienceGroupId: '8c96de85fb452530bba3d1c86877799577610a33',
      startDate: { month: 'Aug', year: 2025, text: 'Aug 2025' },
      endDate: { month: 'Mar', year: 2026, text: 'Mar 2026' },
      companyLogo: { url: LNMIIT_LOGO, sizes: [{ url: LNMIIT_LOGO, width: 400, height: 400 }] },
    },
    {
      position: 'Intern',
      location: null,
      employmentType: null,
      workplaceType: null,
      companyName: 'Divya Laxmi Pvt Ltd.',
      companyLinkedinUrl:
        'https://www.linkedin.com/search/results/all/?keywords=Divya+Laxmi+Pvt+Ltd%2E',
      duration: '2 mos',
      description:
        '\u2013Developed a RAG-based backend system for the company website using vector embeddings and PostgreSQL for retrieval, powered by Groq-hosted Llama models for generation.\n\u2013 Implemented input validation and hallucination-detection guardrails to filter unsafe or ungrounded queries before and after generation.\n\u2013 Built an evaluation pipeline using Ragas to benchmark retrieval and generation quality, informing iterative improvements to the pipeline.\n\u2013 Collaborated with the engineering team on daily standups and code reviews, ensuring consistent code quality across the backend codebase.',
      skills: null,
      startDate: { month: 'Jun', year: 2026, text: 'Jun 2026' },
      endDate: { month: 'Jul', year: 2026, text: 'Jul 2026' },
    },
  ],
  education: [
    {
      schoolName: 'The LNM Institute of Information Technology',
      schoolLinkedinUrl: 'https://www.linkedin.com/company/15132857/',
      schoolId: '15132857',
      degree: 'Bachelor of Technology',
      fieldOfStudy: 'CCE',
      skills: [],
      startDate: { year: 2023, text: '2023' },
      endDate: { year: 2027, text: '2027' },
      period: '2023 - 2027',
      schoolLogo: { url: LNMIIT_LOGO, sizes: [{ url: LNMIIT_LOGO, width: 400, height: 400 }] },
    },
    {
      schoolName: 'Motion Kota',
      schoolLinkedinUrl: 'https://www.linkedin.com/search/results/all/?keywords=Motion+Kota',
      schoolId: null,
      degree: null,
      fieldOfStudy: null,
      skills: [],
      startDate: { month: 'Aug', year: 2022, text: 'Aug 2022' },
      endDate: { month: 'Apr', year: 2023, text: 'Apr 2023' },
      period: 'Aug 2022 - Apr 2023',
      schoolLogo: null,
    },
    {
      schoolName: "St Peter's Sr Sec School Bharatpur ",
      schoolLinkedinUrl:
        "https://www.linkedin.com/search/results/all/?keywords=St+Peter%27s+Sr+Sec+School+Bharatpur+",
      schoolId: null,
      degree: null,
      fieldOfStudy: null,
      skills: [],
      startDate: null,
      endDate: { month: 'Mar', year: 2022, text: 'Mar 2022' },
      period: 'Mar 2022',
      schoolLogo: null,
    },
  ],
  certifications: [],
  projects: [],
  volunteering: [],
  receivedRecommendations: [],
  skills: [
    { name: 'Retrieval-Augmented Generation (RAG)' },
    { name: 'Agentic AI Development' },
    { name: 'LangChain' },
    { name: 'LangGraph' },
    { name: 'Node.js' },
    { name: 'MongoDB' },
    { name: 'Tailwind CSS' },
    { name: 'React.js' },
    { name: 'Next.js' },
    { name: 'Postman API' },
    { name: 'Stripe (Software)' },
    { name: 'Prisma ORM' },
    { name: 'Continuous Integration and Continuous Delivery (CI/CD)' },
    { name: 'Jenkins' },
    { name: 'PostgreSQL' },
    { name: 'Apache Kafka' },
    { name: 'Express.js' },
    { name: 'Docker' },
    { name: 'Amazon Web Services (AWS)' },
    { name: 'Software Design' },
    // This one also carries `positions`, which is deliberately not mapped.
    { name: 'Web Development', positions: ['Member at Google Developer Groups on Campus - LNMIIT'] },
    { name: 'MERN Stack' },
    { name: 'Smart Contracts' },
    { name: 'Web3' },
    { name: 'Solidity' },
    { name: 'Blockchain' },
    { name: 'C++' },
    { name: 'web3.js' },
  ],
  publications: [],
  courses: [],
  patents: [],
  honorsAndAwards: [],
  languages: [],
  organizations: [],
  causes: [],

  // --- below here is returned but deliberately NOT mapped ---
  featured: {
    images: [],
    link: null,
    title: null,
    subtitle: null,
    slides: [
      {
        title: 'raghav_resume.pdf',
        subtitle: 'Google Docs',
        description: null,
        url: 'https://drive.google.com/file/d/1YLJQ_Jz_-HarbS9fWbv3JtWTdjLSn2cf/view',
        image: { url: null },
      },
    ],
  },
  composeOptionType: 'PREMIUM_INMAIL',
  moreProfiles: [
    {
      id: 'ACoAAFPLS4QB7j7VskPd57xkB65ncxlXfm36BfQ',
      firstName: 'Piyush',
      lastName: 'Agarwal',
      position: 'Ex - SDE Intern | Competitive Programmer | Full Stack Web Developer ',
      publicIdentifier: 'piyush-agarwal-284988332',
      linkedinUrl: 'https://www.linkedin.com/in/piyush-agarwal-284988332',
    },
  ],
  interests: [
    {
      interestName: 'Companies',
      elements: [
        {
          title: 'Microsoft',
          subtitle: null,
          link: 'https://www.linkedin.com/company/1035/',
          caption: '28,973,724 followers',
        },
      ],
    },
  ],
  originalQuery: { query: 'https://www.linkedin.com/in/raghav-khandelwal-3512412a5/' },
};

/** The dataset as the endpoint returns it: an array of items. */
export const apifyDataset: readonly unknown[] = [apifyProfileItem];

/**
 * A profile stripped to nulls and empties. Derived from the real shape above,
 * to prove the mapper degrades rather than failing on a thin profile.
 */
export const apifySparseItem: Record<string, unknown> = {
  publicIdentifier: 'sparse-person',
  linkedinUrl: 'https://www.linkedin.com/in/sparse-person',
  firstName: null,
  lastName: null,
  headline: null,
  about: null,
  location: null,
  experience: null,
  education: null,
  skills: null,
  certifications: null,
  languages: null,
  profilePicture: null,
  coverPicture: null,
};

/** A provider error blob: no identifying field, so it is not a profile. */
export const apifyErrorItem: Record<string, unknown> = {
  inputUrl: 'https://www.linkedin.com/in/nobody',
  succeeded: false,
  error: 'Profile could not be retrieved',
};
