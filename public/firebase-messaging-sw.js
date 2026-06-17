/* Service worker de Firebase Cloud Messaging (notificaciones en segundo plano).
 *
 * La config de Firebase (valores públicos NEXT_PUBLIC_*) se pasa como query
 * params al registrar el SW desde lib/push-client.ts, así no se hardcodea en
 * el repo. Si falta config, el SW no inicializa (no rompe nada).
 */
/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js")
importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js")

const params = new URLSearchParams(self.location.search)
const firebaseConfig = {
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
}

if (firebaseConfig.projectId && firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig)
  const messaging = firebase.messaging()

  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {}
    const title = notification.title || "EduPanel"
    self.registration.showNotification(title, {
      body: notification.body || "",
      icon: notification.icon || "/icon-192.png",
      data: payload.data || {},
    })
  })
}

// Al hacer clic en la notificación, enfocar/abrir la app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
