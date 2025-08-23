let appInd
let g = window.location.pathname === "/gm"
let at = window.location.pathname === "/as"
let mode = "apps"
let t = window.top.location.pathname === "/ta"

function saveToLocal(path) {
  sessionStorage.setItem("GoUrl", path)
}

function handleClick(app) {
  if (typeof app.say !== "undefined") {
    alert(app.say)
  }

  let Selected = app.link
  if (app.links && app.links.length > 1) {
    Selected = getSelected(app.links)
    if (!Selected) {
      return false
    }
  }

  if (app.local) {
    saveToLocal(Selected)
    window.location.href = "ta"
    if (t) {
      window.location.href = Selected
    }
  } else if (app.local2) {
    saveToLocal(Selected)
    window.location.href = Selected
  } else if (app.blank) {
    blank(Selected)
  } else if (app.now) {
    now(Selected)
    if (t) {
      window.location.href = Selected
    }
  } else if (app.custom) {
    Custom(app)
  } else if (app.dy) {
    dy(Selected)
  } else {
    go(Selected)
    if (t) {
      blank(Selected)
    }
  }
  return false
}

function getSelected(links) {
  let options = links.map((link, index) => `${index + 1}: ${link.name}`).join("\n")
  let choice = prompt(`Select a link by entering the corresponding number:\n${options}`)
  let selectedIndex = parseInt(choice, 10) - 1

  if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= links.length) {
    alert("Invalid selection. Please try again.")
    return null
  }

  return links[selectedIndex].url
}

function CustomApp(customApp) {
  let apps
  if (g) {
    apps = localStorage.getItem("Gcustom")
  } else if (mode === "tools") {
    apps = localStorage.getItem("Tcustom")
  } else {
    apps = localStorage.getItem("Acustom")
  }

  if (apps === null) {
    apps = {}
  } else {
    apps = JSON.parse(apps)
  }

  const key = "custom" + (Object.keys(apps).length + 1)
  apps[key] = customApp

  if (g) {
    localStorage.setItem("Gcustom", JSON.stringify(apps))
  } else if (mode === "tools") {
    localStorage.setItem("Tcustom", JSON.stringify(apps))
  } else {
    localStorage.setItem("Acustom", JSON.stringify(apps))
  }
}

function setPin(index) {
  let pins
  if (g) {
    pins = localStorage.getItem("Gpinned")
  } else if (mode === "tools") {
    pins = localStorage.getItem("Tpinned")
  } else {
    pins = localStorage.getItem("Apinned")
  }

  if (pins === null || pins === "") {
    pins = []
  } else {
    pins = pins.split(",").map(Number)
  }
  if (pinContains(index, pins)) {
    let remove = pins.indexOf(index)
    pins.splice(remove, 1)
  } else {
    pins.push(index)
  }
  if (g) {
    localStorage.setItem("Gpinned", pins)
  } else if (mode === "tools") {
    localStorage.setItem("Tpinned", pins)
  } else {
    localStorage.setItem("Apinned", pins)
  }
  loadList()
}

function pinContains(i, p) {
  if (p == "") {
    return false
  }
  for (var x = 0; x < p.length; x += 1) {
    if (p[x] === i) {
      return true
    }
  }
  return false
}

function Custom(app) {
  const title = prompt("Enter title for the app:")
  const link = prompt("Enter link for the app:")
  if (title && link) {
    const customApp = {
      name: "[Custom] " + title,
      link: link,
      image: "/assets/media/icons/custom.webp",
      custom: false,
      categories: ["all"],
      status: "ok",
    }
    CustomApp(customApp)
    loadList()
  }
}

function loadList() {
  let path = "/assets/json/a.min.json"
  if (g) {
    path = "/assets/json/g.min.json"
  } else if (mode === "tools") {
    path = "/assets/json/t.min.json"
  }
  fetch(path)
    .then((response) => response.json())
    .then((appsList) => {
      const nonPinnedApps = document.querySelector(".container-apps")
      const pinnedApps = document.querySelector(".pinned-apps")
      nonPinnedApps.innerHTML = ""
      pinnedApps.innerHTML = ""

      let pinList
      if (g) {
        pinList = localStorage.getItem("Gpinned") || ""
      } else if (mode === "tools") {
        pinList = localStorage.getItem("Tpinned") || ""
      } else {
        pinList = localStorage.getItem("Apinned") || ""
      }
      pinList = pinList ? pinList.split(",").map(Number) : []
      appInd = 0

      let storedApps
      if (g) {
        storedApps = JSON.parse(localStorage.getItem("Gcustom"))
      } else if (mode === "tools") {
        storedApps = JSON.parse(localStorage.getItem("Tcustom"))
      } else {
        storedApps = JSON.parse(localStorage.getItem("Acustom"))
      }
      if (storedApps) {
        appsList = Object.values(storedApps).concat(appsList)
      }

      appsList.sort((a, b) => {
        if (a.name.startsWith("[Custom]")) return -1
        if (b.name.startsWith("[Custom]")) return 1
        return a.name.localeCompare(b.name)
      })

      const statusOverrides = JSON.parse(localStorage.getItem("statusOverrides") || "{}")
      const removedApps = JSON.parse(localStorage.getItem("removedApps") || "[]")

      appsList.forEach((app) => {
        if (removedApps.includes(app.name)) return

        if (app.categories && app.categories.includes("local")) {
          app.local = true
        } else if (app.link && (app.link.includes("now.gg") || app.link.includes("nowgg.me"))) {
          app.partial = true
          app.say = app.say || "Now.gg is currently not working for some users."
        } else if (app.link && app.link.includes("nowgg.nl")) {
          app.error = true
          app.say = app.say || "NowGG.nl is currently down."
        }

        let pinNum = appInd
        const columnDiv = document.createElement("div")
        columnDiv.classList.add("column")
        const cat = app.categories ? app.categories.join(" ") : "all"
        columnDiv.setAttribute("data-category", cat)

        const pinIcon = document.createElement("i")
        pinIcon.classList.add("fa", "fa-map-pin")
        pinIcon.ariaHidden = true

        const btn = document.createElement("button")
        btn.appendChild(pinIcon)
        btn.style.float = "right"
        btn.style.backgroundColor = "rgb(45,45,45)"
        btn.style.borderRadius = "50%"
        btn.style.borderColor = "transparent"
        btn.style.color = "white"
        btn.style.top = "-200px"
        btn.style.position = "relative"
        btn.onclick = function () {
          setPin(pinNum)
        }
        btn.title = "Pin"

        const link = document.createElement("a")
        link.onclick = function () {
          handleClick(app)
        }

        const image = document.createElement("img")
        image.width = 140
        image.height = 140
        image.loading = "lazy"
        if (app.image) {
          image.src = app.image
        } else {
          image.style.display = "none"
        }

        const paragraph = document.createElement("p")
        paragraph.textContent = app.name

        if (app.error) {
          paragraph.style.color = "red"
          if (!app.say) app.say = "This app is currently not working."
        } else if (app.load) {
          paragraph.style.color = "yellow"
          if (!app.say) app.say = "This app may experience excessive loading times."
        } else if (app.partial) {
          paragraph.style.color = "yellow"
          if (!app.say) app.say = "This app is currently experiencing some issues."
        }

        let status = "ok"
        if (app.error) status = "error"
        else if (app.load || app.partial) status = "warn"
        if (app.status) status = app.status
        if (statusOverrides[app.name]) status = statusOverrides[app.name]

        const badge = document.createElement("span")
        badge.classList.add("status-badge", status)
        badge.innerHTML =
          status === "error"
            ? "<i class='fa-solid fa-xmark'></i>"
            : status === "warn"
            ? "<i class='fa-solid fa-minus'></i>"
            : "<i class='fa-solid fa-check'></i>"

        link.appendChild(image)
        link.appendChild(paragraph)
        link.appendChild(badge)
        columnDiv.appendChild(link)

        if (appInd != 0) {
          columnDiv.appendChild(btn)
        }

        if (pinList && appInd != 0) {
          if (pinContains(appInd, pinList)) {
            pinnedApps.appendChild(columnDiv)
          } else {
            nonPinnedApps.appendChild(columnDiv)
          }
        } else {
          nonPinnedApps.appendChild(columnDiv)
        }
        appInd += 1
      })

      const appsContainer = document.getElementById("apps-container")
      appsContainer.appendChild(pinnedApps)
      appsContainer.appendChild(nonPinnedApps)
    })
    .catch((error) => console.error("Error fetching JSON data:", error))
}

document.addEventListener("DOMContentLoaded", () => {
  if (at) {
    document.getElementById("showApps").addEventListener("click", () => {
      mode = "apps"
      updateCategories()
      loadList()
    })
    document.getElementById("showTools").addEventListener("click", () => {
      mode = "tools"
      updateCategories()
      loadList()
    })
    updateCategories()
  }
  loadList()
})

function updateCategories() {
  if (!at) return
  const category = document.getElementById("category")
  if (mode === "tools") {
    category.innerHTML = `
        <option value="all">All</option>
        <option value="ai">AI</option>
        <option value="ad">AI Detectors</option>
        <option value="pc">Plagiarism Checker</option>
        <option value="ts">YouTube Transcript</option>`
    document.getElementById("showTools").classList.add("active")
    document.getElementById("showApps").classList.remove("active")
  } else {
    category.innerHTML = `
        <option value="all">All</option>
        <option value="android">Android Emulator</option>
        <option value="social">Social</option>
        <option value="stream">Streaming</option>
        <option value="message">Messaging</option>
        <option value="media">TV & Movies</option>
        <option value="game">Game Sites</option>
        <option value="cloud">Cloud Gaming</option>
        <option value="tool">Tools</option>
        <option value="AI">AI</option>
        <option value="emu">Emulator</option>
        <option value="mail">Mail</option>`
    document.getElementById("showApps").classList.add("active")
    document.getElementById("showTools").classList.remove("active")
  }
}

function show_category() {
  var selectedCategories = Array.from(document.querySelectorAll("#category option:checked")).map((option) => option.value)
  var games = document.getElementsByClassName("column")

  for (var i = 0; i < games.length; i++) {
    var game = games[i]
    var categories = game.getAttribute("data-category").split(" ")

    if (selectedCategories.length === 0 || selectedCategories.some((category) => categories.includes(category))) {
      game.style.display = "block"
    } else {
      game.style.display = "none"
    }
  }
}

function search_bar() {
  var input = document.getElementById("searchbarbottom")
  var filter = input.value.toLowerCase()
  var games = document.getElementsByClassName("column")

  for (var i = 0; i < games.length; i++) {
    var game = games[i]
    var name = game.getElementsByTagName("p")[0].textContent.toLowerCase()
    game.style.display = name.includes(filter) ? "block" : "none"
  }
}
