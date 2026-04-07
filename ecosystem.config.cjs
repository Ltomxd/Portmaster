module.exports = {
  apps: [
    {
      name: "portmaster",
      cwd: "/home/kira/descargas/Portmaster",
      script: "dist/index.js",
      args: "dashboard",
      interpreter: "/home/kira/.nvm/versions/node/v25.2.1/bin/node",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};