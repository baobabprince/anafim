function portrait({ id, background, skin, hair, clothing, style }) {
  const longHair = style === 'long';
  const curlyHair = style === 'curly';
  const backHair = longHair
    ? `<path d="M39 78C34 44 47 22 80 22s47 23 41 59l-5 36H44z" fill="${hair}"/>`
    : curlyHair
      ? `<path d="M39 72c-9-24 8-50 24-48 12-15 35-12 42-1 22 3 28 29 16 48l-8 9H47z" fill="${hair}"/>`
      : `<path d="M42 67c-7-25 7-44 24-46 17-11 38-3 45 9 10 5 13 22 7 38l-8 9H50z" fill="${hair}"/>`;
  const frontHair = longHair
    ? `<path d="M42 61c2-24 16-35 36-35 21 0 35 13 39 36-13-3-20-12-24-20-10 10-28 15-51 16z" fill="${hair}"/><path d="M44 69c-2 17 2 34 8 44l-9-2-8-28zM116 69c2 17-2 34-8 44l9-2 8-28z" fill="${hair}"/>`
    : `<path d="M43 61c1-22 14-35 35-35 22 0 36 13 39 37-13-2-22-9-27-19-11 10-26 15-47 17z" fill="${hair}"/>`;
  const glasses = id === 'rachel' || id === 'david'
    ? `<g fill="none" stroke="#51483e" stroke-width="2.4"><rect x="49" y="65" width="23" height="16" rx="7"/><rect x="88" y="65" width="23" height="16" rx="7"/><path d="M72 71h16"/></g>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${background}"/><stop offset="1" stop-color="#f8f2e7"/></linearGradient>
      <linearGradient id="face" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${skin}"/><stop offset="1" stop-color="#d89f79"/></linearGradient>
      <linearGradient id="shirt" x1="0" y1="0" x2="0.9" y2="1"><stop stop-color="${clothing}"/><stop offset="1" stop-color="#344b45"/></linearGradient>
    </defs>
    <rect width="160" height="160" fill="url(#bg)"/>
    <circle cx="80" cy="68" r="52" fill="#ffffff" opacity=".22"/>
    <path d="M20 160c4-30 24-48 60-48s56 18 60 48z" fill="url(#shirt)"/>
    <path d="M68 104h24v24c-7 9-17 9-24 0z" fill="${skin}"/>
    ${backHair}
    <ellipse cx="46" cy="76" rx="8" ry="12" fill="${skin}"/>
    <ellipse cx="114" cy="76" rx="8" ry="12" fill="${skin}"/>
    <path d="M48 59c0-22 12-34 32-34s32 12 32 34v25c0 25-16 39-32 39S48 109 48 84z" fill="url(#face)"/>
    <path d="M57 62c5-3 11-3 16 0M87 62c5-3 11-3 16 0" fill="none" stroke="#573d32" stroke-width="2.3" stroke-linecap="round"/>
    <ellipse cx="65" cy="73" rx="3" ry="2.3" fill="#3b342f"/>
    <ellipse cx="96" cy="73" rx="3" ry="2.3" fill="#3b342f"/>
    <path d="M79 73c-1 8-4 13-2 15 2 2 5 2 7 0" fill="none" stroke="#ae7458" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M69 97c7 6 16 6 23 0" fill="none" stroke="#8f5148" stroke-width="2.2" stroke-linecap="round"/>
    <ellipse cx="57" cy="87" rx="7" ry="3" fill="#d77d6e" opacity=".2"/>
    <ellipse cx="103" cy="87" rx="7" ry="3" fill="#d77d6e" opacity=".2"/>
    ${frontHair}
    ${glasses}
    <path d="M66 116l14 11 14-11" fill="none" stroke="#f4eee1" stroke-width="2" opacity=".8"/>
    <path d="M30 150c20-12 80-12 100 0" fill="none" stroke="#ffffff" stroke-width="2" opacity=".18"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const DEMO_PHOTOS = {
  '@I1@': portrait({ id:'tamar', background:'#d6e4d7', skin:'#e8b993', hair:'#49352e', clothing:'#7e9986', style:'long' }),
  '@I2@': portrait({ id:'david', background:'#dce3e8', skin:'#d9a77f', hair:'#53483e', clothing:'#637b86', style:'short' }),
  '@I3@': portrait({ id:'rachel', background:'#e8d8ca', skin:'#e4b898', hair:'#695044', clothing:'#aa775e', style:'long' }),
  '@I6@': portrait({ id:'itai', background:'#d9e3d3', skin:'#d5a07a', hair:'#3d3531', clothing:'#597968', style:'short' }),
  '@I7@': portrait({ id:'noa', background:'#eee0d5', skin:'#f0c39b', hair:'#65412f', clothing:'#c17d62', style:'long' }),
  '@I8@': portrait({ id:'yoav', background:'#dbe5e8', skin:'#dca780', hair:'#564138', clothing:'#65838b', style:'curly' }),
  '@I9@': portrait({ id:'maya', background:'#e6dfcc', skin:'#efbd91', hair:'#764833', clothing:'#9b8960', style:'long' }),
};
