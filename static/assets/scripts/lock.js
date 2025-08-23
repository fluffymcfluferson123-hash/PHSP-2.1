document.addEventListener("DOMContentLoaded", () => {
  const registered = localStorage.getItem("registered") === "true"
  if (!registered) {
    window.location.href = "/li"
  }
})
