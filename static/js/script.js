$('.sidebar ul li ').on('click', function () {
    $('.sidebar ul li.active').removeClass('active');
    $(this).addClass('active');
})

$('.sidebar-btn').on('click', function () {
    if ($('.sidebar').hasClass('active')) {
        $('.sidebar').removeClass('active');
    } else {
        $('.sidebar').addClass('active');
    }
})

$('.close-btn').on('click', function () {
    $('.sidebar').removeClass('active');

})

$('#positive-input').change(function () {
    if ($('#positive-input').is(':checked')) {
    }
})

$('#signup-pass').keyup((e) => {
    let require = ['uppercase', 'lowercase', 'number', 'special', 'length']
    let difference = $(require).not(checkPass(e.currentTarget.value)).get()
    if (difference.length > 0) {
        $('#error-pass').css('display', 'block')
        $('#error-pass').removeAttr('hidden');
        $('#error-pass').children('li').each(function () {
            $(this).css({
                'display': 'list-item',
                'margin-left': '10px'
            })
        })

        $('#signup-pass').addClass('is-invalid');

        if (difference.includes('uppercase')) {
            $('#pass-uppercase').removeClass('valid-feedback');
            $('#pass-uppercase').addClass('invalid-feedback');
        } else {
            $('#pass-uppercase').addClass('valid-feedback');
            $('#pass-uppercase').removeClass('invalid-feedback');
        }

        if (difference.includes('lowercase')) {
            $('#pass-lowercase').removeClass('valid-feedback');
            $('#pass-lowercase').addClass('invalid-feedback');
        } else {
            $('#pass-lowercase').addClass('valid-feedback');
            $('#pass-lowercase').removeClass('invalid-feedback');
        }

        if (difference.includes('number')) {
            $('#pass-number').removeClass('valid-feedback');
            $('#pass-number').addClass('invalid-feedback');
        } else {
            $('#pass-number').addClass('valid-feedback');
            $('#pass-number').removeClass('invalid-feedback');
        }

        if (difference.includes('special')) {
            $('#pass-special').removeClass('valid-feedback');
            $('#pass-special').addClass('invalid-feedback');
        } else {
            $('#pass-special').addClass('valid-feedback');
            $('#pass-special').removeClass('invalid-feedback');
        }

        if (difference.includes('length')) {
            $('#pass-length').removeClass('valid-feedback');
            $('#pass-length').addClass('invalid-feedback');
        } else {
            $('#pass-length').addClass('valid-feedback');
            $('#pass-length').removeClass('invalid-feedback');
        }
    } else {
        $('#error-pass').attr('hidden', true);
        $('#signup-pass').addClass('is-valid');
        $('#signup-pass').removeClass('is-invalid');

    }

    function checkPass(val) {
        const results = [];

        // Check for uppercase letters
        if (/[A-Z]/.test(val)) {
            results.push('uppercase');
        }

        // Check for lowercase letters
        if (/[a-z]/.test(val)) {
            results.push('lowercase');
        }

        // Check for numbers
        if (/[0-9]/.test(val)) {
            results.push('number');
        }

        // Check for special characters
        if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(val)) {
            results.push('special');
        }

        // Check length between 8-18 characters
        if (val.length >= 8 && val.length <= 18) {
            results.push('length');
        }

        return results;
    }
})

$('#re-pass').keyup((e) => {
    if (e.currentTarget.value !== '' && $('#signup-pass').val() !== e.currentTarget.value) {
        $('#re-pass').addClass('is-invalid');
        $('#error-repass').css('display', 'block');
        $('#error-repass').removeAttr('hidden');

    } else if (e.currentTarget.value !== '' && $('#signup-pass').val() === e.currentTarget.value) {
        $('#re-pass').removeClass('is-invalid');
        $('#re-pass').addClass('is-valid');
        $('#error-repass').attr('hidden', true);
    }
})

$('.form-signin').change((e) => {
    let wroteAll = 0,
        valid = true;
    $('.form-signin').children().children("input[type='text'], input[type='email'], input[type='password']").each(function () {
        if ($(this).val()) {
            wroteAll++;
        }
        if ($(this).hasClass('is-invalid')) {
            valid = false;
        }
        if (wroteAll == 4 && valid === true) {
            $(".form-signin input[type='submit']").removeAttr("disabled");
        } else {
            $(".form-signin input[type='submit']").attr("disabled");

        }
    })
})


$('#arrow-btn').on('click', () => {
    $(window).animate({ scrollTop: 0 }, 1000);
});

let lastScrollTop = 0;
$(window).scroll(function (event) {
    if ($(this).scrollTop() < lastScrollTop) {
        $('#arrow-btn').css({
            'display': 'block'
        });
    } else {
        $('#arrow-btn').css({
            'display': 'none'
        });
    }
    lastScrollTop = $(this).scrollTop();
});