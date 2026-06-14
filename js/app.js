(function () {
  const STATES_ABBREV = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
    "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
    "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
    "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC",
    "American Samoa": "AS", "Guam": "GU", "Northern Mariana Islands": "MP",
    "Puerto Rico": "PR", "U.S. Virgin Islands": "VI"
  };

  let allMembers = [];
  let zipData = null;
  let currentFilter = { state: "", zip: "" };

  function timeAgo(dateStr) {
    if (!dateStr) return null;
    var voteDate = new Date(dateStr);
    var now = new Date();
    var diffMs = now - voteDate;
    var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return diffDays + " days ago";
    if (diffDays < 14) return "1 week ago";
    if (diffDays < 30) return Math.floor(diffDays / 7) + " weeks ago";
    if (diffDays < 60) return "1 month ago";
    if (diffDays < 365) return Math.floor(diffDays / 30) + " months ago";
    return Math.floor(diffDays / 365) + " year" + (Math.floor(diffDays / 365) > 1 ? "s" : "") + " ago";
  }

  function urgencyClass(dateStr) {
    if (!dateStr) return "urgency-critical";
    var diffDays = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) return "urgency-low";
    if (diffDays <= 14) return "urgency-medium";
    if (diffDays <= 30) return "urgency-high";
    return "urgency-critical";
  }

  function daysSince(dateStr) {
    if (!dateStr) return Infinity;
    return Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  }

  function formatName(name) {
    var parts = name.split(", ");
    if (parts.length === 2) return parts[1] + " " + parts[0];
    return name;
  }

  function renderCard(member) {
    var card = document.createElement("div");
    card.className = "member-card party-" + member.party;

    var abbrev = STATES_ABBREV[member.state] || member.state;
    var districtLabel = member.district ? abbrev + "-" + member.district : abbrev + " (At-Large)";

    var lv = member.last_vote;
    var timeStr = lv ? timeAgo(lv.date) : null;
    var urgency = urgencyClass(lv ? lv.date : null);

    var voteHtml;
    if (lv) {
      voteHtml =
        '<div class="time-ago ' + urgency + '">' + timeStr + '</div>' +
        '<div class="vote-info">' +
          '<span class="vote-position">' + lv.position + '</span> ' +
          lv.description +
        '</div>';
    } else {
      voteHtml = '<div class="no-vote">No votes recorded</div>';
    }

    card.innerHTML =
      '<div class="member-header">' +
        '<div>' +
          '<div class="member-name">' + formatName(member.name) + '</div>' +
          '<div class="member-detail">' + districtLabel + '</div>' +
        '</div>' +
        '<span class="member-party party-' + member.party + '">' + member.party + '</span>' +
      '</div>' +
      voteHtml;

    return card;
  }

  function sortMembers(members, sortBy) {
    var sorted = members.slice();
    switch (sortBy) {
      case "absence":
        sorted.sort(function (a, b) {
          var da = daysSince(a.last_vote ? a.last_vote.date : null);
          var db = daysSince(b.last_vote ? b.last_vote.date : null);
          if (da === Infinity && db === Infinity) return 0;
          if (da === Infinity) return -1;
          if (db === Infinity) return 1;
          return db - da;
        });
        break;
      case "recent":
        sorted.sort(function (a, b) {
          var da = daysSince(a.last_vote ? a.last_vote.date : null);
          var db = daysSince(b.last_vote ? b.last_vote.date : null);
          if (da === Infinity && db === Infinity) return 0;
          if (da === Infinity) return 1;
          if (db === Infinity) return -1;
          return da - db;
        });
        break;
      case "name":
        sorted.sort(function (a, b) {
          return formatName(a.name).localeCompare(formatName(b.name));
        });
        break;
      case "state":
        sorted.sort(function (a, b) {
          var cmp = a.state.localeCompare(b.state);
          if (cmp !== 0) return cmp;
          return (a.district || 0) - (b.district || 0);
        });
        break;
    }
    return sorted;
  }

  function renderLeaderboard() {
    var list = document.getElementById("leaderboard-list");
    var sorted = allMembers.slice().sort(function (a, b) {
      var da = daysSince(a.last_vote ? a.last_vote.date : null);
      var db = daysSince(b.last_vote ? b.last_vote.date : null);
      if (da === Infinity && db === Infinity) return 0;
      if (da === Infinity) return -1;
      if (db === Infinity) return 1;
      return db - da;
    });

    var top20 = sorted.slice(0, 20);
    list.innerHTML = "";
    for (var i = 0; i < top20.length; i++) {
      var m = top20[i];
      var abbrev = STATES_ABBREV[m.state] || m.state;
      var districtLabel = m.district ? abbrev + "-" + m.district : abbrev + " (At-Large)";
      var lv = m.last_vote;
      var timeStr = lv ? timeAgo(lv.date) : "No votes";
      var urgency = urgencyClass(lv ? lv.date : null);

      var li = document.createElement("li");
      li.className = "lb-item party-" + m.party;
      li.innerHTML =
        '<span class="lb-rank">' + (i + 1) + '</span>' +
        '<div class="lb-info">' +
          '<div class="lb-name">' + formatName(m.name) + '</div>' +
          '<div class="lb-detail">' + districtLabel + ' · ' + m.party + '</div>' +
        '</div>' +
        '<span class="lb-time ' + urgency + '">' + timeStr + '</span>';
      list.appendChild(li);
    }
  }

  function render() {
    var grid = document.getElementById("members-grid");
    var status = document.getElementById("status");
    var sortBy = document.getElementById("sort-select").value;

    var filtered = allMembers;

    if (currentFilter.zip && zipData) {
      var zipInfo = zipData[currentFilter.zip];
      if (zipInfo) {
        filtered = allMembers.filter(function (m) {
          var abbrev = STATES_ABBREV[m.state] || "";
          return abbrev === zipInfo.state && zipInfo.districts.indexOf(m.district) !== -1;
        });
      } else {
        filtered = [];
      }
    } else if (currentFilter.state) {
      filtered = allMembers.filter(function (m) {
        return m.state === currentFilter.state;
      });
    }

    var sorted = sortMembers(filtered, sortBy);

    grid.innerHTML = "";
    for (var i = 0; i < sorted.length; i++) {
      grid.appendChild(renderCard(sorted[i]));
    }

    if (currentFilter.zip && filtered.length === 0) {
      status.textContent = "No representatives found for zip code " + currentFilter.zip + ".";
    } else {
      status.textContent = "Showing " + sorted.length + " of " + allMembers.length + " members";
    }
  }

  function populateStateDropdown() {
    var select = document.getElementById("state-select");
    var stateNames = [];
    var seen = {};
    for (var i = 0; i < allMembers.length; i++) {
      var s = allMembers[i].state;
      if (!seen[s]) {
        seen[s] = true;
        stateNames.push(s);
      }
    }
    stateNames.sort();
    for (var j = 0; j < stateNames.length; j++) {
      var opt = document.createElement("option");
      opt.value = stateNames[j];
      opt.textContent = stateNames[j];
      select.appendChild(opt);
    }
  }

  async function loadZipData() {
    if (zipData) return;
    try {
      var resp = await fetch("data/zip_districts.json");
      zipData = await resp.json();
    } catch (e) {
      console.error("Could not load zip data:", e);
    }
  }

  async function init() {
    try {
      var resp = await fetch("data/members.json");
      var data = await resp.json();

      var updatedEl = document.getElementById("updated-at");
      if (data.updated_at) {
        updatedEl.textContent = new Date(data.updated_at).toLocaleDateString("en-US", {
          year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit"
        });
      }

      allMembers = [];
      var members = data.members;
      for (var id in members) {
        if (members.hasOwnProperty(id)) {
          var m = members[id];
          m.bioguideId = id;
          allMembers.push(m);
        }
      }

      populateStateDropdown();
      renderLeaderboard();
      render();

      document.getElementById("state-select").addEventListener("change", function () {
        currentFilter.state = this.value;
        currentFilter.zip = "";
        document.getElementById("zip-input").value = "";
        render();
      });

      document.getElementById("sort-select").addEventListener("change", function () {
        render();
      });

      document.getElementById("zip-btn").addEventListener("click", async function () {
        var zip = document.getElementById("zip-input").value.trim();
        if (zip.length !== 5 || !/^\d{5}$/.test(zip)) {
          document.getElementById("status").textContent = "Please enter a valid 5-digit zip code.";
          return;
        }
        await loadZipData();
        if (!zipData) {
          document.getElementById("status").textContent = "Zip code lookup is not available.";
          return;
        }
        currentFilter.zip = zip;
        currentFilter.state = "";
        document.getElementById("state-select").value = "";
        render();
      });

      document.getElementById("zip-input").addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          document.getElementById("zip-btn").click();
        }
      });
    } catch (e) {
      document.getElementById("status").textContent = "Error loading data. Please try again later.";
      console.error(e);
    }
  }

  init();
})();
