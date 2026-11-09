// Shared behaviour for the inner pages: ribbon of stills, scroll reveal, footer links.
(function () {
    // Resolve asset paths relative to this script so pages work at any depth
    var base = document.currentScript.src.replace(/[^/]*$/, '');

    // Ribbon of stills; the set is doubled so the drift loops seamlessly
    var track = document.getElementById('ribbonTrack');
    if (track) {
        var ids = ['08', '13', '15', '12', '18', '14', '11', '24', '16', '19'];
        for (var pass = 0; pass < 2; pass++) {
            ids.forEach(function (id) {
                var img = document.createElement('img');
                img.src = base + 'images/web/still-' + id + '.webp';
                img.alt = '';
                img.decoding = 'async';
                track.appendChild(img);
            });
        }
    }

    // Fade sections in as they scroll into view
    var reveals = document.querySelectorAll('.reveal');
    if (reveals.length) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15 });
        reveals.forEach(function (el) { io.observe(el); });
    }

    // Email and Instagram links in the footer
    var social = document.getElementById('footerSocial');
    if (social) {
        social.innerHTML =
            '<a href="mailto:hello@belovedfilms.co.uk"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>hello@belovedfilms.co.uk</a>' +
            '<a href="https://www.instagram.com/belovedfilms.uk" target="_blank" rel="noopener noreferrer" aria-label="Follow us on Instagram"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>belovedfilms.uk</a>';
    }
})();
