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

$('#signup-pass').focusout((e) => {
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
        let arr = val.split('');

        let result = arr.map((elem) => {
            let uppercase = false,
                lowercase = false,
                number = false,
                special = false,
                length = false;
            if (elem.charCodeAt(0) >= 33 && elem.charCodeAt(0) <= 47) {
                special = true;
            }

            if (elem.charCodeAt(0) >= 48 && elem.charCodeAt(0) <= 57) {
                number = true;
            }

            if (elem.charCodeAt(0) >= 65 && elem.charCodeAt(0) <= 90) {
                uppercase = true;
            }

            if (elem.charCodeAt(0) >= 97 && elem.charCodeAt(0) <= 122) {
                lowercase = true;
            }
            if (val.length >= 8 && val.length <= 20) {
                console.log('it got inside and true');
                length = true;
            }

            if (uppercase == true) {
                return 'uppercase'
            }
            if (lowercase == true) {
                return 'lowercase'
            }
            if (number == true) {
                return 'number'
            }
            if (special == true) {
                return 'special'
            }
            if (length == true) {
                return 'length'
            }
        })
        return result;
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
    $('.form-signin').children().children("input[type='text'], input[type='email'], input[type='password']").each(function()  {
        if($(this).val()) {
            wroteAll++;
        }
        if($(this).hasClass('is-invalid')) {
            valid = false;
        }
        if(wroteAll == 4 && valid === true) {
            $(".form-signin input[type='submit']").removeAttr("disabled");
        } else {
            $(".form-signin input[type='submit']").attr("disabled");

        }
    })
})


