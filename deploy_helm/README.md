# Build
npm install
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
npm i -g @vercel/ncc
npm run build

# lint
npm init @eslint/config
