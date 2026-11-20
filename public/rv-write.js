/* Buzzin · the review page a review-request email opens. One card per item: stars, then title / review / photos /
   "would you recommend it". The star tapped in the email is already picked. */
(function () {
  var C = window.RVW; if (!C) return;
  var API = C.origin + "/rv/" + C.store;
  var NAVY = "#242F3F";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function star(on) { return '<svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6.2 6.7.7-5 4.6 1.4 6.7L12 17.4l-6 3.4 1.4-6.7-5-4.6 6.7-.7z" fill="' + (on ? NAVY : "#fff") + '" stroke="#2C3E50" stroke-width="1.3" stroke-linejoin="round"/></svg>'; }
  var box = document.getElementById("items");
  C.items.forEach(function (it, idx) {
    var done = C.done.indexOf(String(it.product_id)) >= 0;
    var el = document.createElement("div"); el.className = "it"; el.id = "it" + idx;
    el.innerHTML = '<div class="hd">' + (it.image ? '<img src="' + esc(it.image) + '" alt="">' : "") + "<div><b>" + esc(it.title) + "</b>" + (it.variant ? '<span style="color:#676986;font-size:13px">' + esc(it.variant) + "</span>" : "") + "</div></div>" +
      (done ? '<div class="ok">✓ Thanks, you reviewed this one.</div>' :
      '<div class="pick" role="radiogroup" aria-label="Rating">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-v="' + n + '" aria-label="' + n + ' star' + (n > 1 ? "s" : "") + '">' + star(false) + "</button>"; }).join("") + "</div>" +
      '<div class="form"><label>Title</label><input type="text" class="t" maxlength="150" placeholder="Sum it up">' +
      '<label>Review</label><textarea class="b" maxlength="5000" placeholder="How was the fit and fabric? How did your little one like it?"></textarea>' +
      '<label>Would you recommend it?</label><div class="yn"><button type="button" data-rec="1" class="on">Yes</button><button type="button" data-rec="0">No</button></div>' +
      '<label>Photos <span style="font-weight:400;color:#676986">(optional)</span></label><input type="file" class="f" accept="image/*" multiple><div class="thumbs"></div>' +
      '<label>Your name as shown</label><input type="text" class="n" maxlength="60" value="' + esc(C.name) + '">' +
      '<div class="err" hidden></div><button type="button" class="btn send">Submit review</button></div>');
    box.appendChild(el);
    if (done) return;
    var rating = 0, rec = true, photos = [];
    function paint() { el.querySelectorAll(".pick button").forEach(function (b) { b.innerHTML = star(Number(b.dataset.v) <= rating); }); }
    el.querySelectorAll(".pick button").forEach(function (b) { b.onclick = function () { rating = Number(b.dataset.v); paint(); el.classList.add("open"); if (rating <= 3) rec = false, el.querySelector('[data-rec="0"]').click(); }; });
    el.querySelectorAll(".yn button").forEach(function (b) { b.onclick = function () { rec = b.dataset.rec === "1"; el.querySelectorAll(".yn button").forEach(function (x) { x.classList.toggle("on", x === b); }); }; });
    el.querySelector(".f").onchange = function (e) {
      [].slice.call(e.target.files || [], 0, 6 - photos.length).forEach(function (f) {
        fetch(API + "/upload", { method: "POST", headers: { "Content-Type": f.type || "image/jpeg" }, body: f }).then(function (r) { return r.json(); }).then(function (j) { if (j.url) { photos.push({ url: j.url }); el.querySelector(".thumbs").insertAdjacentHTML("beforeend", '<img src="' + esc(j.url) + '" alt="">'); } });
      });
    };
    el.querySelector(".send").onclick = function () {
      var btn = this, err = el.querySelector(".err"); err.hidden = true;
      if (!rating) { err.hidden = false; err.textContent = "Pick a star rating."; return; }
      btn.disabled = true; btn.textContent = "Sending…";
      fetch(API + "/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: C.token, product_id: it.product_id, product_title: it.title, product_image: it.image, product_handle: it.handle, variant: it.variant,
        rating: rating, title: el.querySelector(".t").value, body: el.querySelector(".b").value, name: el.querySelector(".n").value, email: C.email, recommended: rec, media: photos }) })
        .then(function (r) { return r.json(); }).then(function (j) {
          if (j.error) { err.hidden = false; err.textContent = j.error; btn.disabled = false; btn.textContent = "Submit review"; return; }
          el.querySelector(".form").outerHTML = '<div class="ok">✓ Thank you! ' + (j.status === "published" ? "Your review is live." : "Your review will appear after a quick check.") + "</div>";
          el.querySelector(".pick").style.pointerEvents = "none";
          var next = document.querySelector(".it:not(.open) .pick"); if (next) next.scrollIntoView({ behavior: "smooth", block: "center" });
        }).catch(function () { err.hidden = false; err.textContent = "Something went wrong. Please try again."; btn.disabled = false; btn.textContent = "Submit review"; });
    };
    if (String(it.product_id) === C.focus && C.rating) { rating = C.rating; paint(); el.classList.add("open"); if (rating <= 3) { rec = false; el.querySelector('[data-rec="0"]').classList.add("on"); el.querySelector('[data-rec="1"]').classList.remove("on"); } setTimeout(function () { el.scrollIntoView({ block: "start" }); el.querySelector(".b").focus(); }, 50); }
  });
  var foot = document.createElement("p"); foot.style.cssText = "text-align:center;margin-top:28px;font-size:13px"; foot.innerHTML = (window.parent !== window || document.getElementById('bzw')) ? '' : '<a href="' + esc(C.shop) + '" style="color:#676986">Back to ' + esc(C.brand) + "</a>"; box.appendChild(foot);
})();
