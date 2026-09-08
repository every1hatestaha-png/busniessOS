"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("businessOSDesktop", {
  startAuth: () => ipcRenderer.send("desktop-auth:start"),
  signOut: () => {
    console.info("[D6][logout] preload logout invoked");
    return ipcRenderer.invoke("desktop-auth:signout");
  },
  switchAccount: () => {
    console.info("[D7][account] preload switch-account invoked");
    return ipcRenderer.invoke("desktop-auth:switch-account");
  },
  getVersion: () => ipcRenderer.invoke("app:version"),
});
