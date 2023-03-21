CTFd._internal.challenge.preRender = function () { }

CTFd._internal.challenge.postRender = function () { }

CTFd._internal.challenge.submit = function (preview) {
    var challenge_id = parseInt(CTFd.lib.$('#challenge-id').val())
    var submission = CTFd.lib.$('#challenge-input').val()

    var body = {
        'challenge_id': challenge_id,
        'submission': submission,
    }
    var params = {}
    if (preview) {
        params['preview'] = true
    }

    return CTFd.api.post_challenge_attempt(params, body).then(function (response) {
        if (response.status === 429) {
            // User was ratelimited but process response
            return response
        }
        if (response.status === 403) {
            // User is not logged in or CTF is paused.
            return response
        }
        return response
    })
};

function toggleLoading(btn) {
    // var icon = btn.querySelector('i');
    btn.disabled = !btn.disabled;
    // icon.classList.toggle('fa-spin');
    // icon.classList.toggle('fa-spinner');
}

function resetAlert() {
    let alert = $(".deployment-actions > .alert").first();
    alert.empty();
    alert.removeClass("alert-danger");
    return alert;
}

function toggleChallengeCreate() {
    let btn = $(".create-chal").first();
    btn.toggleClass('d-none');
}

function toggleChallengeReset() {
    let btn = $(".reset-chal").first();
    btn.toggleClass('d-none');
}

function toggleChallengeUpdate() {
    let btn = $(".extend-chal").first();
    btn.toggleClass('d-none');

    btn = $(".terminate-chal").first();
    btn.toggleClass('d-none');
}

function calculateExpiry(date) {
    // Get the difference in minutes
    let difference = Math.floor((date - Date.now()) / (1000 * 60));
    return difference;
}

function createChallengeLinkElement(data, parent) {
    let expiry = calculateExpiry(new Date(data.deployment.expires));
    console.log({ data, parent, expires: data.expires, date: new Date(data.expires) });

    if (expiry > 0) {
        var expires = document.createElement('span');
        expires.textContent = "Expire dans " + calculateExpiry(new Date(data.deployment.expires)) + " minutes";
        parent.append(expires);
    } 
    var link = document.createElement('a');
    if (data.deployment.host.startsWith('http')) {
        link.href = data.deployment.host;
    } else {
        link.href = "javascript:void";
    }
    link.textContent = data.deployment.host;
    parent.append(document.createElement('br'));
    parent.append(link);
}

function awaitChallengeReady(data) {
    
}

function getDeployment(deployment) {
    let alert = resetAlert();

    $.ajax({
        type: "GET",
        url: "api/kube_ctf/" + deployment,
        success: function(data) {
            createChallengeLinkElement(data, alert);
            toggleChallengeUpdate();
            toggleChallengeReset();
        },
        error: function(error) {
            alert.append("Challenge not started")
            toggleChallengeCreate();
        }
    }) 
}

function createDeployment(btn) {
    let deployment = btn.dataset.deployment;
    toggleLoading(btn);
    let alert = resetAlert();

    // Can't use the nice format cause need to put content-type header in
    $.ajax({
        type: "POST",
        url: "api/kube_ctf/" + deployment,
        data: JSON.stringify({action: "create"}),
        contentType: "application/json",
        success: function(data) {
	    createChallengeLinkElement(data, alert);
	    toggleChallengeUpdate();
	    toggleChallengeCreate();
        toggleChallengeReset();
	    toggleLoading(btn);
        },
        error: function(error) {
            alert.append(error.responseJSON.error || error.responseJSON.message)
            if (error.responseJSON.runningChallenges) {
                alert.append(
                    document.createElement('hr'),
                    ...error.responseJSON.runningChallenges.map(challName => {
                        const line = document.createElement('div');
                        line.classList.add('instance-list');

                        const p = document.createElement('p');
                        p.innerText = challName;
                        
                        const delBtn = document.createElement('button');
                        delBtn.classList.add('btn', 'btn-danger');
                        delBtn.innerText = 'X';
                        delBtn.dataset.deployment = challName
                        delBtn.onclick = () => terminateDeployment(delBtn, false)
                            .then(() => {
                                createDeployment(btn);
                            });

                        line.append(
                            p, 
                            delBtn
                        );
                        return line;
                    })
                );
            }
            alert.addClass("alert-danger")
            toggleLoading(btn);
        }
    }) 
}

function extendDeployment(btn) {
    let deployment = btn.dataset.deployment;
    toggleLoading(btn);
    let alert = resetAlert();

    // Can't use the nice format cause need to put content-type header in
    $.ajax({
        type: "POST",
        url: "api/kube_ctf/" + deployment,
        data: JSON.stringify({action: "extend"}),
        contentType: "application/json",
        success: function(data) {
            createChallengeLinkElement(data, alert)
            toggleLoading(btn);
        },
        error: function(error) {
            alert.append(error.responseJSON.error || error.responseJSON.message)
            alert.addClass("alert-danger")
            toggleLoading(btn);
        }
    })    

}

function resetDeployment(btn) {
    let deployment = btn.dataset.deployment;
    toggleLoading(btn);
    let alert = resetAlert();

    // Can't use the nice format cause need to put content-type header in
    $.ajax({
        type: "POST",
        url: "api/kube_ctf/" + deployment,
        data: JSON.stringify({action: "reset"}),
        contentType: "application/json",
        success: function(data) {
            createChallengeLinkElement(data, alert)
            toggleLoading(btn);
        },
        error: function(error) {
            alert.append(error.responseJSON.error || error.responseJSON.message)
            alert.addClass("alert-danger")
            toggleLoading(btn);
        }
    })
}

function terminateDeployment(btn, updateUI = true) {
    return new Promise((resolve, reject) => {
        let deployment = btn.dataset.deployment;
        toggleLoading(btn);
        let alert = resetAlert();

        // Can't use the nice format cause need to put content-type header in
        $.ajax({
            type: "POST",
            url: "api/kube_ctf/" + deployment,
            data: JSON.stringify({action: "terminate"}),
            contentType: "application/json",
            success: function(data) {
                alert.append("Challenge stoppé")
                if (updateUI) {
                    toggleChallengeCreate();
                    toggleChallengeUpdate();
                    toggleChallengeReset();
                }
                toggleLoading(btn);
                resolve(data);
            },
            error: function(error) {
                alert.append(error.responseJSON.error || error.responseJSON.message)
                alert.addClass("alert-danger")
                toggleLoading(btn);
                reject(error);
            }
        })
    });
}
