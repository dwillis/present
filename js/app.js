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
  let latestVoteNumber = 0;
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

  function voteUrl(lv) {
    if (!lv || !lv.date || !lv.vote_number) return null;
    var year = new Date(lv.date).getFullYear();
    return "https://clerk.house.gov/Votes/" + year + lv.vote_number;
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
      var url = voteUrl(lv);
      var descHtml = url
        ? '<a href="' + url + '" target="_blank" rel="noopener">' + lv.description + '</a>'
        : lv.description;
      voteHtml =
        '<div class="time-ago ' + urgency + '">' + timeStr + '</div>' +
        '<div class="vote-info">' +
          '<span class="vote-position">' + lv.position + '</span> ' +
          descHtml +
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

  var DELEGATE_STATES = ["American Samoa", "District of Columbia", "Guam",
    "Northern Mariana Islands", "Puerto Rico", "Virgin Islands",
    "U.S. Virgin Islands"];

  function formatDate(dateStr) {
    var d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function renderLeaderboard() {
    var list = document.getElementById("leaderboard-list");
    var section = document.getElementById("leaderboard");

    var eligible = allMembers.filter(function (m) {
      if (DELEGATE_STATES.indexOf(m.state) !== -1) return false;
      var days = daysSince(m.last_vote ? m.last_vote.date : null);
      return days >= 7;
    });

    eligible.sort(function (a, b) {
      var da = daysSince(a.last_vote ? a.last_vote.date : null);
      var db = daysSince(b.last_vote ? b.last_vote.date : null);
      if (da === Infinity && db === Infinity) return 0;
      if (da === Infinity) return -1;
      if (db === Infinity) return 1;
      return db - da;
    });

    var top10 = eligible.slice(0, 10);
    list.innerHTML = "";

    if (top10.length === 0) {
      section.style.display = "none";
      return;
    }
    section.style.display = "";

    for (var i = 0; i < top10.length; i++) {
      var m = top10[i];
      var abbrev = STATES_ABBREV[m.state] || m.state;
      var districtLabel = m.district ? abbrev + "-" + m.district : abbrev + " (At-Large)";
      var lv = m.last_vote;
      var timeStr = lv ? timeAgo(lv.date) : "No votes";
      var dateStr = lv ? formatDate(lv.date) : "";
      var urgency = urgencyClass(lv ? lv.date : null);
      var url = voteUrl(lv);

      var li = document.createElement("li");
      li.className = "lb-item party-" + m.party;
      var dateHtml = dateStr
        ? (url ? '<a class="lb-date" href="' + url + '" target="_blank" rel="noopener">' + dateStr + '</a>'
               : '<span class="lb-date">' + dateStr + '</span>')
        : '';
      var missed = (lv && latestVoteNumber) ? latestVoteNumber - lv.vote_number : null;
      var missedHtml = missed !== null && missed > 0
        ? '<span class="lb-missed">' + missed + ' vote' + (missed !== 1 ? 's' : '') + ' missed</span>'
        : '';
      li.innerHTML =
        '<span class="lb-rank">' + (i + 1) + '</span>' +
        '<div class="lb-info">' +
          '<div class="lb-name">' + formatName(m.name) + '</div>' +
          '<div class="lb-detail">' + districtLabel + ' · ' + m.party + '</div>' +
        '</div>' +
        '<div class="lb-time-wrap">' +
          '<span class="lb-time ' + urgency + '">' + timeStr + '</span>' +
          dateHtml +
          missedHtml +
        '</div>';
      list.appendChild(li);
    }
  }

  function render() {
    var grid = document.getElementById("members-grid");
    var status = document.getElementById("status");
    var sortBy = document.getElementById("sort-select").value;
    var resetBtn = document.getElementById("reset-btn");

    var hasFilter = currentFilter.state || currentFilter.zip;
    resetBtn.hidden = !hasFilter;

    var leaderboard = document.getElementById("leaderboard");
    if (hasFilter) {
      leaderboard.style.display = "none";
    } else {
      leaderboard.style.display = "";
      renderLeaderboard();
    }

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

    var overWeek = [];
    var dayBuckets = {};
    for (var i = 0; i < sorted.length; i++) {
      var m = sorted[i];
      var d = daysSince(m.last_vote ? m.last_vote.date : null);
      if (d >= 7) {
        overWeek.push(m);
      } else {
        if (!dayBuckets[d]) dayBuckets[d] = [];
        dayBuckets[d].push(m);
      }
    }

    for (var j = 0; j < overWeek.length; j++) {
      grid.appendChild(renderCard(overWeek[j]));
    }

    var dayKeys = Object.keys(dayBuckets).map(Number).sort(function (a, b) { return b - a; });
    for (var k = 0; k < dayKeys.length; k++) {
      var day = dayKeys[k];
      var bucket = dayBuckets[day];
      var label = day === 0 ? "Today" : day === 1 ? "Yesterday" : day + " days ago";

      var details = document.createElement("details");
      details.className = "day-group";
      if (hasFilter) details.open = true;
      var summary = document.createElement("summary");
      summary.className = "day-group-summary";
      summary.innerHTML = '<span class="day-group-label">' + label + '</span>' +
        '<span class="day-group-count">' + bucket.length + ' member' + (bucket.length !== 1 ? 's' : '') + '</span>';
      details.appendChild(summary);

      var innerGrid = document.createElement("div");
      innerGrid.className = "members-grid";
      for (var l = 0; l < bucket.length; l++) {
        innerGrid.appendChild(renderCard(bucket[l]));
      }
      details.appendChild(innerGrid);
      grid.appendChild(details);
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

      latestVoteNumber = data.latest_vote_number || 0;
      allMembers = [];
      var members = data.members;
      for (var id in members) {
        if (members.hasOwnProperty(id)) {
          var m = members[id];
          if (DELEGATE_STATES.indexOf(m.state) !== -1) continue;
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

      document.getElementById("reset-btn").addEventListener("click", function () {
        currentFilter.state = "";
        currentFilter.zip = "";
        document.getElementById("state-select").value = "";
        document.getElementById("zip-input").value = "";
        document.getElementById("sort-select").value = "absence";
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
