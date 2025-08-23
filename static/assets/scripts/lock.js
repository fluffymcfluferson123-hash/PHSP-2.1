document.addEventListener("DOMContentLoaded", () => {
  const registered = localStorage.getItem("registered") === "true"
  if (!registered) {
    const lockScreen = document.getElementById("lock-screen")
    if (lockScreen) {
      lockScreen.style.display = "flex"
    }
  }
})
