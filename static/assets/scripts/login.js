document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signup-form")
  const loginForm = document.getElementById("login-form")

  async function handleAuth(url, username, password) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    })
    return res.ok
  }

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault()
    const username = document.getElementById("signup-username").value.trim()
    const password = document.getElementById("signup-password").value
    if (await handleAuth("/api/signup", username, password)) {
      localStorage.setItem("registered", "true")
      window.location.href = "/./as"
    } else {
      alert("Signup failed")
    }
  })

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault()
    const username = document.getElementById("login-username").value.trim()
    const password = document.getElementById("login-password").value
    if (await handleAuth("/api/login", username, password)) {
      localStorage.setItem("registered", "true")
      window.location.href = "/./as"
    } else {
      alert("Invalid credentials")
    }
  })
})
