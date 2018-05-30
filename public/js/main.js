$(function() {
    $('[data-toggle="tooltip"]').tooltip();

    //Menu show/hide overlat menu
    $(".dropdown").on("show.bs.dropdown", function(event) {
        //var x = $(event.relatedTarget).text(); 
        enable_overlay();
    });
    $(".dropdown").on("hide.bs.dropdown", function() {
        disable_overlay();
    });
});


// scroll 
function wheel(e) {
    e.preventDefault();
}

function disable_scroll() {
    if (window.addEventListener) {
        window.addEventListener('DOMMouseScroll', wheel, false);
    }
    window.onmousewheel = document.onmousewheel = wheel;
}

function enable_scroll() {
    if (window.removeEventListener) {
        window.removeEventListener('DOMMouseScroll', wheel, false);
    }
    window.onmousewheel = document.onmousewheel = document.onkeydown = null;
}

// overlay
function enable_overlay() {
    jQuery("span.global-overlay").remove(); // remove first!
    jQuery('body').append('<span class="global-overlay"></span>');
}
function disable_overlay() {
    jQuery("span.global-overlay").remove();
}