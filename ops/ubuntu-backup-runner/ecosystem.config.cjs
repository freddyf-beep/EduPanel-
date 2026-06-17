module.exports = {
  apps: [
    {
      name: "edupanel-firebase-live-backup",
      script: "./run-live-backup.sh",
      interpreter: "/usr/bin/bash",
      cwd: "/home/udefret/edupanel-backup-runner",
      autorestart: true,
      exp_backoff_restart_delay: 5000,
      max_restarts: 50,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
}
