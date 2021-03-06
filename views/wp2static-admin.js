var validation_errors = '';
var deploy_options = {
    zip: {
        exportSteps: [
            'finalize_deployment'
        ],
        required_fields: {
        }
    },
    folder: {
        exportSteps: [
            'finalize_deployment'
        ],
        required_fields: {
        }
    },
};

var site_info = wp2staticString.site_info;
var current_deployment_method = wp2staticString.current_deployment_method;

// TODO: get the log out of the archive, along with it's meta infos
var log_file_url = site_info.uploads_url + 'wp2static-working-files/EXPORT-LOG.txt';

var export_action = '';
var export_targets = [];
var export_commence_time = '';
var export_duration = '';
var batch_increment = 0;
var status_text = '';
var protocolAndDomainRE = /^(?:\w+:)?\/\/(\S+)$/;
var localhostDomainRE = /^localhost[\:?\d]*(?:[^\:?\d]\S*)?$/
var nonLocalhostDomainRE = /^[^\s\.]+\.\S{2,}$/;
var pollingIntervalID = '';
var timerIntervalID = '';
var status_descriptions = {
    'crawl_site' : 'Crawling initial file list',
    'post_process_archive_dir' : 'Processing the crawled files',
    'post_export_teardown' : 'Cleaning up after processing'
};

jQuery( document ).ready(
    function($){
        function generateFileListSuccessCallback( serverResponse ) {
            if ( ! serverResponse ) {
                $( '#current_action' ).html( 'Failed to generate initial file list. Please <a href="https://docs.wp2static.com" target="_blank">contact support</a>' );
                $( '.pulsate-css' ).hide();
            } else {
                $( '#initial_crawl_list_loader' ).hide();
                $( '#initial_crawl_list_count' ).text( serverResponse + ' URLs were detected on your site that will be used to initiate the crawl. Other URLs will be discovered while crawling.' );
                $( '#preview_initial_crawl_list_button' ).show();

                $( '#startExportButton' ).prop( 'disabled', false );
                $( '.saveSettingsButton' ).prop( 'disabled', false );
                $( '.resetDefaultSettingsButton' ).prop( 'disabled', false );
                $( '#current_action' ).html( serverResponse + ' URLs were detected for initial crawl list. <a href="#" id="GoToDetectionTabButton">Adjust detection via the URL Detection tab.</a>' );
                $( '.pulsate-css' ).hide();
            }
        }

        function generateFileListFailCallback( serverResponse ) {
            failed_deploy_message = 'Failed to generate Initial Crawl List. Please check your permissions to the WordPress upload directory or check your Export Log in case of more info.';

            $( '#current_action' ).html( failed_deploy_message );
            $( ".pulsate-css" ).hide();
            $( '#startExportButton' ).prop( 'disabled', true );
            $( '.saveSettingsButton' ).prop( 'disabled', false );
            $( '.resetDefaultSettingsButton' ).prop( 'disabled', false );
            $( '.cancelExportButton' ).hide();
            $( '#initial_crawl_list_loader' ).hide();
        }

        function prepareInitialFileList() {
            status_text = 'Analyzing site... this may take a few minutes (but it\'s worth it!)';
            $( '#current_action' ).html( status_text );

            sendWP2StaticAJAX(
                'generate_filelist_preview',
                generateFileListSuccessCallback,
                generateFileListFailCallback
            );
        }

        function sendWP2StaticAJAX( ajax_action, success_callback, fail_callback ) {
            $( '.hiddenActionField' ).val( 'wp_static_html_output_ajax' );
            $( '#hiddenAJAXAction' ).val( ajax_action );
            $( '#progress' ).show();
            $( '.pulsate-css' ).show();

            data = $( ".options-form :input" )
            .filter(
                function(index, element) {
                    return $( element ).val() != '';
                }
            )
            .serialize();

            $.ajax(
                {
                    url: ajaxurl,
                    data: data,
                    dataType: 'html',
                    method: 'POST',
                    success: success_callback,
                    error: fail_callback
                }
            );
        }

        function saveOptionsSuccessCallback( serverResponse ) {
            $( '#progress' ).hide();

            location.reload();
        }

        function saveOptionsFailCallback( serverResponse ) {
            $( '#progress' ).hide();

            location.reload();
        }

        function saveOptions() {
            $( '#current_action' ).html( 'Saving options' );
            sendWP2StaticAJAX(
                'save_options',
                saveOptionsSuccessCallback,
                saveOptionsFailCallback
            );
        }

        function millisToMinutesAndSeconds(millis) {
            var minutes = Math.floor( millis / 60000 );
            var seconds = ((millis % 60000) / 1000).toFixed( 0 );
            return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
        }

        function processExportTargets () {
            if ( export_targets.length > 0) {
                target = export_targets.shift();

                export_steps = deploy_options[target]['exportSteps'];

                doAJAXExport( export_steps );
            } else {
                // if zip was selected, call to get zip name and enable the button with the link to download
                if (current_deployment_method === 'zip') {
                    zipURL = site_info.uploads_url + 'wp2static-exported-site.zip?cacheBuster=' + Date.now();
                    $( '#downloadZIP' ).attr( 'href', zipURL );
                    $( '#downloadZIP' ).show();
                } else {
                    // for other methods, show the Go to my static site link
                    $( '#goToMyStaticSite' ).attr( 'href', $( '#baseUrl' ).val() );
                    $( '#goToMyStaticSite' ).show();
                }

                // all complete
                exportCompleteTime = + new Date();
                export_duration = exportCompleteTime - export_commence_time;

                // clear export commence time for next run
                export_commence_time = '';

                stopTimer();
                $( '#current_action' ).text( 'Process completed in ' + millisToMinutesAndSeconds( export_duration ) + ' (mins:ss)' );
                $( "#goToMyStaticSite" ).focus();
                $( ".pulsate-css" ).hide();
                $( '#startExportButton' ).prop( 'disabled', false );
                $( '.saveSettingsButton' ).prop( 'disabled', false );
                $( '.resetDefaultSettingsButton' ).prop( 'disabled', false );
                $( '.cancelExportButton' ).hide();
                notifyMe();
            }
        }

        function downloadExportLogSuccessCallback( serverResponse) {
            if ( ! serverResponse ) {
                $( '#current_action' ).html( 'Failed to download Export Log <a id="downloadExportLogButton" href="#">try again</a>' );
                $( '.pulsate-css' ).hide();
            } else {
                $( '#current_action' ).html( 'Download <a href="' + serverResponse + '"> ' + serverResponse + '</a>' );
                $( '.pulsate-css' ).hide();
            }
        }

        function downloadExportLogFailCallback( serverResponse) {
            $( '.pulsate-css' ).hide();
            $( '#current_action' ).html( 'Failed to download Export Log <a id="downloadExportLogButton" href="#">try again</a>' );
        }

        function deleteCrawlCacheSuccessCallback( serverResponse) {
            if ( ! serverResponse ) {
                $( '.pulsate-css' ).hide();
                $( '#current_action' ).html( 'Failed to delete Crawl Cache.' );
            } else {
                $( '#current_action' ).html( 'Crawl Cache successfully deleted.' );
                $( '.pulsate-css' ).hide();
            }
        }

        function deleteCrawlCacheFailCallback( serverResponse) {
            $( '.pulsate-css' ).hide();
            $( '#current_action' ).html( 'Failed to delete Crawl Cache.' );
        }

        function downloadExportLog() {
            $( '#current_action' ).html( 'Downloading Export Log...' );

            sendWP2StaticAJAX(
                'download_export_log',
                downloadExportLogSuccessCallback,
                downloadExportLogFailCallback
            );
        }

        $( document ).on(
            'click',
            '#detectEverythingButton',
            function(evt) {
                evt.preventDefault();
                $( '#detectionOptionsTable input[type="checkbox"]' ).attr( 'checked', true );
            }
        );

        $( document ).on(
            'click',
            '#deleteCrawlCache',
            function(evt) {
                evt.preventDefault();
                $( '#current_action' ).html( 'Deleting Crawl Cache...' );

                sendWP2StaticAJAX(
                    'delete_crawl_cache',
                    deleteCrawlCacheSuccessCallback,
                    deleteCrawlCacheFailCallback
                );
            }
        );

        $( document ).on(
            'click',
            '#detectNothingButton',
            function(evt) {
                evt.preventDefault();
                $( '#detectionOptionsTable input[type="checkbox"]' ).attr( 'checked', false );
            }
        );

        $( document ).on(
            'click',
            '#downloadExportLogButton',
            function(evt) {
                evt.preventDefault();
                downloadExportLog();
            }
        );

        function ajaxErrorHandler () {
            stopTimer();

            failed_deploy_message = 'Failed during "' + status_text +
              '", <button id="downloadExportLogButton">Download export log</button>';

            $( '#current_action' ).html( failed_deploy_message );
            $( ".pulsate-css" ).hide();
            $( '#startExportButton' ).prop( 'disabled', false );
            $( '.saveSettingsButton' ).prop( 'disabled', false );
            $( '.resetDefaultSettingsButton' ).prop( 'disabled', false );
            $( '.cancelExportButton' ).hide();
        }

        function startExportSuccessCallback( serverResponse ) {
            var initial_steps = [
            'crawl_site',
            'post_process_archive_dir'
            ];

            doAJAXExport( initial_steps );
        }

        function startTimer() {
            timerIntervalID = window.setInterval( updateTimer, 1000 );
        }

        function stopTimer() {
            window.clearInterval( timerIntervalID );
        }

        function updateTimer() {
            exportCompleteTime = + new Date();
            runningTime = exportCompleteTime - export_commence_time;

            $( '#export_timer' ).html(
                '<b>Export duration: </b>' + millisToMinutesAndSeconds( runningTime )
            );
        }

        function startExport() {
            // start timer
            export_commence_time = + new Date();
            startTimer();

            // startPolling();

            validation_errors = getValidationErrors();

            if (validation_errors !== '') {
                alert( validation_errors );

                // TODO: place in function that resets any in progress counters, etc
                $( '#progress' ).hide();
                $( '#startExportButton' ).prop( 'disabled', false );
                $( '.saveSettingsButton' ).prop( 'disabled', false );
                $( '.resetDefaultSettingsButton' ).prop( 'disabled', false );
                $( '.cancelExportButton' ).hide();

                return false;
            }

            $( '#current_action' ).html( 'Starting export...' );

            // showProgress();

            // reset export targets to avoid having left-overs from a failed run
            export_targets = [];

            if ( current_deployment_method === 'zip') {
                $( '#createZip' ).attr( 'checked', 'checked' );
            }
            export_targets.push( current_deployment_method );

            sendWP2StaticAJAX(
                'prepare_for_export',
                startExportSuccessCallback,
                ajaxErrorHandler
            );
        }

        function clearProgressAndResults() {
            $( '#downloadZIP' ).hide();
            $( '#goToMyStaticSite' ).hide();
            $( '#exportDuration' ).hide();
        }

        function showProgress() {
            clearProgressAndResults();
            $( '#progress' ).show();
            $( ".pulsate-css" ).show();
        }

        function getValidationErrors() {
            validation_errors = '';
            // check for when targetFolder is showing (plugin reset state)
            if ($( '#targetFolder' ).is( ':visible' ) &&
            ( $( '#targetFolder' ).val() == '' ) ) {
                validation_errors += 'Target folder may not be empty. Please adjust your settings.';
            }

            if (( $( '#baseUrl' ).val() === undefined ||
            $( '#baseUrl' ).val() == '' ) &&
            ! $( '#allowOfflineUsage' ).is( ":checked" )) {
                    validation_errors += "Please set the Base URL field to the address you will host your static site.\n";
            }

            // TODO: on new Debian package-managed environment, this was falsely erroring
            if ( ! isUrl( $( '#baseUrl' ).val() ) && ! $( '#allowOfflineUsage' ).is( ":checked" )) {
                // TODO: testing / URL as base
                if ($( '#baseUrl' ).val() !== '/') {
                    validation_errors += "Please set the Base URL field to a valid URL, ie http://mystaticsite.com.\n";
                }
            }

            required_fields =
            deploy_options[current_deployment_method]['required_fields'];

            if ( required_fields ) {
                  validateEmptyFields( required_fields );
            }

            repo_field = deploy_options[current_deployment_method]['repo_field'];

            if ( repo_field ) {
                validateRepoField( repo_field );
            }

            return validation_errors;
        }

        function validateRepoField( repo_field ) {
            repo = $( '#' + repo_field['field'] + '' ).val();

            if (repo != '') {
                if (repo.split( '/' ).length !== 2) {
                      validation_errors += repo_field['message'];
                }
            }
        }

        function validateEmptyFields( required_fields ) {
            Object.keys( required_fields ).forEach(
                function(key,index) {
                    if ($( '#' + key ).val() == '') {
                        validation_errors += required_fields[key] + "\n";
                    }
                }
            );
        }

        function isUrl(string) {
            if (typeof string !== 'string') {
                return false;
            }

            var match = string.match( protocolAndDomainRE );

            if ( ! match) {
                return false;
            }

            var everythingAfterProtocol = match[1];

            if ( ! everythingAfterProtocol) {
                return false;
            }

            if (localhostDomainRE.test( everythingAfterProtocol ) ||
            nonLocalhostDomainRE.test( everythingAfterProtocol )) {
                    return true;
            }

            return false;
        }

        /*
        doAJAXExport() can handle from 1 to n actions
        each action runs, with 3 possible results:
        SUCCESS - action is complete
        > 0 - action is in progress inremental task
        ERROR

        if an action is successful, and there are other actions queued up,
        it will call the function again with the remaining arguments/actions

        if an action is succesful, and there are no other actions queued,
        it will call processExportTargets() to continue any other exports

        if an action is in progress incremental, it will call itself again,
        with all the same arguments

        if an action fails, ajaxErrorHandler() is called
        */
        function doAJAXExport(args) {
            export_action = args[0];
            status_text = export_action;

            if ( status_descriptions[export_action] != undefined ) {
                status_text = status_descriptions[export_action];
            } else {
                status_text = export_action;
            }

            $( '#current_action' ).html( status_text );
            $( '.hiddenActionField' ).val( 'wp_static_html_output_ajax' );
            $( '#hiddenAJAXAction' ).val( export_action );

            data = $( ".options-form :input" )
            .filter(
                function(index, element) {
                    return $( element ).val() != '';
                }
            )
            .serialize();

            $.ajax(
                {
                    url: ajaxurl,
                    data: data,
                    dataType: 'html',
                    method: 'POST',
                    success: function(serverResponse) {
                        // if an action is successful, and there are other actions queued up
                        if (serverResponse === 'SUCCESS' && args.length > 1) {
                            batch_increment = 0;
                            // rm first action now that it's succeeded
                            args.shift();
                            // call function with all other actions
                            doAJAXExport( args );
                            // if an action is in progress incremental, it will call itself again
                        } else if (serverResponse > 0) {
                            doAJAXExport( args );

                            batch_increment += 1;
                        } else if (serverResponse === 'SUCCESS') {
                            // not an incremental action, continue on with export targets
                            processExportTargets();
                            batch_increment = 0;
                        } else {
                            ajaxErrorHandler();
                        }
                    },
                    error: ajaxErrorHandler
                }
            );
        }

        function updateBaseURLReferences() {
            var base_url_previews = $( '.base_url_preview' );

            if ($( '#baseUrl-' + current_deployment_method )) {
                base_url = $( '#baseUrl-' + current_deployment_method ).val();

                $( '#baseUrl' ).val( $( '#baseUrl-' + current_deployment_method ).val() );

                base_url_previews.text( base_url.replace( /\/$/, "" ) + '/' );

                // update the clickable preview url in folder options
                $( '#folderPreviewURL' ).text( site_info.site_url + '/' );
                $( '#folderPreviewURL' ).attr( 'href', (site_info.site_url + '/') );
            }
        }

        function hideOtherVendorMessages() {
            notices = $( '.update-nag, .updated, .error, .is-dismissible, .elementor-message' );

            $.each(
                notices,
                function(index, element) {
                    if ( ! $( element ).hasClass( 'wp2static-notice' ) ) {
                        $( element ).hide();
                    }
                }
            );
        }

        /*
        TODO: quick win to get the select menu options to behave like the sendViaFTP, etc checkboxes
        */
        // TODO: remove this completely?
        function setDeploymentMethod(selected_deployment_method) {
            // hide zip dl link for all
            $( '#downloadZIP' ).hide();
            current_deployment_method = selected_deployment_method;

            // set the selected option in case calling this from outside the event handler
            $( '.selected_deployment_method' ).val( selected_deployment_method );
        }

        function offlineUsageChangeHandler(checkbox) {
            if ($( checkbox ).is( ':checked' )) {
                $( '#baseUrl-zip' ).prop( 'disabled', true );
            } else {
                $( '#baseUrl-zip' ).prop( 'disabled', false );
            }
        }

        function setExportSettingDetailsVisibility(changed_checkbox) {
            checkbox_name = $( changed_checkbox ).attr( 'name' );
            export_option_name = checkbox_name.replace( 'sendVia', '' ).toLowerCase();

            var export_option_elements = $( '.' + export_option_name );

            if ($( changed_checkbox ).is( ":checked" )) {
                export_option_elements.show();
                // unhide all the inputs, the following span and the following br
            } else {
                // hide all the inputs, the following span and the following br
                export_option_elements.hide();
            }
        }

        /*
        render the information and settings blocks based on the deployment method selected
        */
        function renderSettingsBlock(selected_deployment_method) {
            // hide non-active deployment methods
            $( '[class$="_settings_block"]' ).hide();
            // hide those not selected
            $( '.' + selected_deployment_method + '_settings_block' ).show();
        }

        function notifyMe() {
            if ( ! Notification) {
                alert( 'All exports are complete!.' );
                return;
            }

            if (Notification.permission !== "granted") {
                Notification.requestPermission();
            } else {
                var notification = new Notification(
                    'WP Static HTML Export',
                    {
                        icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/68/Wordpress_Shiny_Icon.svg/768px-Wordpress_Shiny_Icon.svg.png',
                        body: "Exports have finished!",
                    }
                );

                notification.onclick = function () {
                    parent.focus();
                    window.focus();
                    this.close();
                };
            }
        }

        function reloadLogFile() {
            // get current log selection
            current_log_target = 'export_log';

            // if not empty, call loadLogFile again
            if ( current_log_target ) {
                loadLogFile( current_log_target );
            }
        }

        function loadLogFile() {
            // display loading icon
            $( '#log_load_progress' ).show();

            $( "#export_log_textarea" ).attr( 'disabled', true );

            // set textarea content to 'Loading log file...'
            $( "#export_log_textarea" ).html( 'Loading log file...' );

            // load the log file
            $.get(
                log_file_url + '?cacheBuster=' + Date.now(),
                function( data ) {
                    // hide loading icon
                    $( '#log_load_progress' ).hide();

                    // set textarea to enabled
                    $( "#export_log_textarea" ).attr( 'disabled', false );

                    // set textarea content
                    $( "#export_log_textarea" ).html( data );
                }
            ).fail(
                function() {
                    $( '#log_load_progress' ).hide();

                    // set textarea to enabled
                    $( "#export_log_textarea" ).attr( 'disabled', false );

                    // set textarea content
                    $( "#export_log_textarea" ).html( 'Requested log file not found' );
                }
            );
        }

        if (Notification.permission !== "granted") {
            Notification.requestPermission();
        }

        $( 'input[type="checkbox"]' ).change(
            function() {
                setExportSettingDetailsVisibility( this );
            }
        );

        // disable zip base url field when offline usage is checked
        $( '#allowOfflineUsage' ).change(
            function() {
                offlineUsageChangeHandler( $( this ) );
            }
        );

        // handler when deployment method is changed
        $( '.selected_deployment_method' ).change(
            function() {
                renderSettingsBlock( this.value );
                setDeploymentMethod( this.value );
                updateBaseURLReferences();
                clearProgressAndResults();
            }
        );

        // handler when log selector is changed
        $( '#reload_log_button' ).click(
            function() {
                reloadLogFile();
            }
        );

        // handler when log selector is changed
        $( '#log_switcher' ).change(
            function() {
                loadLogFile( target_log );
            }
        );

        // update base url previews in realtime
        $( document ).on(
            'input',
            '[id^="baseUrl-"]',
            function() {
                updateBaseURLReferences();
            }
        );

        function changeTab( target_tab ) {
            var tabsContentMapping = {
                advanced_settings: 'Advanced Options',
                export_your_site: 'Deployment',
                help_troubleshooting: 'Help',
                export_logs: 'Logs',
                crawl_settings: 'Crawling',
                url_detection: 'URL Detection',
                processing_settings: 'Processing',
                add_ons: 'Add-ons'
            };

            // switch the active tab
            $.each(
                $( '.nav-tab' ),
                function(index, element) {
                    if ( $( element ).text() === target_tab ) {
                        $( element ).addClass( 'nav-tab-active' );
                        $( element ).blur();
                    } else {
                        $( element ).removeClass( 'nav-tab-active' );
                    }
                }
            );

            // hide/show the tab content
            for (var key in tabsContentMapping) {
                if (tabsContentMapping.hasOwnProperty( key )) {
                    if ( tabsContentMapping[key] === target_tab ) {
                        $( '.' + key ).show();
                        $( 'html, body' ).scrollTop( 0 );
                    } else {
                        $( '.' + key ).hide();
                    }
                }
            }
        }

        $( document ).on(
            'click',
            '#GoToDetectionTabButton',
            function(evt) {
                evt.preventDefault();
                changeTab( 'URL Detection' );
            }
        );

        $( document ).on(
            'click',
            '#GoToDeployTabButton,#GoToDeployTabLink',
            function(evt) {
                evt.preventDefault();
                changeTab( 'Deployment' );
            }
        );

        // TODO: create action for #GenerateZIPOfflineUse
        // and #GenerateZIPDeployAnywhere

        $( document ).on(
            'click',
            '#GoToAdvancedTabButton',
            function(evt) {
                evt.preventDefault();
                changeTab( 'Advanced Options' );
            }
        );

        $( document ).on(
            'click',
            '.nav-tab',
            function(evt) {
                evt.preventDefault();
                current_tab = $( this );
                current_tab_text = current_tab.text();
                changeTab( current_tab_text );
            }
        );

        $( document ).on(
            'submit',
            '#general-options' ,
            function(evt) {
                evt.preventDefault();
            }
        );

        $( document ).on(
            'click',
            '#send_support_request' ,
            function(evt) {
                evt.preventDefault();

                var support_request = $( '#supportRequestContent' ).val();

                if ( $( '#supportRequestIncludeLog' ).is( ":checked" ) ) {
                    $.get(
                        log_file_url,
                        function( data ) {
                            support_request += '#### EXPORT LOG ###';
                            support_request += data;

                            data = {
                                email: $( '#supportRequestEmail' ).val(),
                                support_request: support_request,
                            };

                            $.ajax(
                                {
                                    url: 'https://hooks.zapier.com/hooks/catch/4977245/jqj3l4/',
                                    data: data,
                                    dataType: 'html',
                                    method: 'POST',
                                    success: send_support_success_callback,
                                    error: send_support_fail_callback
                                }
                            );
                        }
                    ).fail(
                        function() {
                            console.log( 'failed to retrieve export log' );
                        }
                    );
                }

                data = {
                    email: $( '#supportRequestEmail' ).val(),
                    support_request: support_request,
                };

                $.ajax(
                    {
                        url: 'https://hooks.zapier.com/hooks/catch/4977245/jqj3l4/',
                        data: data,
                        dataType: 'html',
                        method: 'POST',
                        success: send_support_success_callback,
                        error: send_support_fail_callback
                    }
                );

            }
        );

        $( '#startExportButton' ).click(
            function() {
                clearProgressAndResults();
                $( this ).prop( 'disabled', true );
                $( '.saveSettingsButton' ).prop( 'disabled', true );
                $( '.resetDefaultSettingsButton' ).prop( 'disabled', true );
                $( '.cancelExportButton' ).show();
                startExport();
            }
        );

        $( '.cancelExportButton' ).click(
            function() {
                var reallyCancel = confirm( "Stop current export and reload page?" );
                if (reallyCancel) {
                    window.location = window.location.href;
                }
            }
        );

        function send_support_success_callback( serverResponse ) {
            alert( "Successful support request sent" );
        }

        function send_support_fail_callback( serverResponse ) {
            alert( "Failed to send support request. Please try again or contact help@wp2static.com." );
        }

        function resetDefaultSettingsSuccessCallback( serverResponse ) {
            alert( "Settings have been reset to default, the page will now be reloaded." );
            window.location.reload( true );
        }

        function resetDefaultSettingsFailCallback( serverResponse ) {
            alert( "Error encountered in trying to reset settings. Please try refreshing the page." );
        }

        $( '#wp2static-footer' ).on(
            'click',
            '.resetDefaultSettingsButton',
            function(event) {
                event.preventDefault();

                sendWP2StaticAJAX(
                    'reset_default_settings',
                    resetDefaultSettingsSuccessCallback,
                    resetDefaultSettingsFailCallback
                );
            }
        );

        $( '#wp2static-footer' ).on(
            'click',
            '.saveSettingsButton',
            function(event) {
                event.preventDefault();
                saveOptions();
            }
        );

        function  deleteDeployCacheSuccessCallback( serverResponse ) {
            if (serverResponse === 'SUCCESS') {
                alert( 'Deploy cache cleared' );
            } else {
                alert( 'FAIL: Unable to delete deploy cache' );
            }

            spinner.hide();
            $( '.pulsate-css' ).hide();
        }

        function  deleteDeployCacheFailCallback( serverResponse ) {
            alert( 'FAIL: Unable to delete deploy cache' );

            spinner.hide();
            $( '.pulsate-css' ).hide();
        }

        $( '.wrap' ).on(
            'click',
            '#delete_deploy_cache_button',
            function(event) {
                event.preventDefault();
                button = event.currentTarget;
                spinner = $( 'button' ).siblings( 'div.spinner' )
                spinner.show();
                sendWP2StaticAJAX(
                    'delete_deploy_cache',
                    deleteDeployCacheSuccessCallback,
                    deleteDeployCacheFailCallback
                );
            }
        );

        function testDeploymentSuccessCallback( serverResponse ) {
            if (serverResponse === 'SUCCESS') {
                alert( 'Connection/Upload Test Successful' );
            } else {
                alert( 'FAIL: Unable to complete test upload to ' + current_deployment_method );
            }

            spinner.hide();
            $( '.pulsate-css' ).hide();
        }

        function testDeploymentFailCallback( serverResponse ) {
            alert( 'FAIL: Unable to complete test upload to ' + current_deployment_method );
            spinner.hide();
            $( '.pulsate-css' ).hide();
        }

        $( '.wrap' ).on(
            'click',
            '[id$="-test-button"]',
            function(event) {
                event.preventDefault();
                spinner = $( 'button' ).siblings( 'div.spinner' )
                spinner.show();

                sendWP2StaticAJAX(
                    'test_' + current_deployment_method,
                    testDeploymentSuccessCallback,
                    testDeploymentFailCallback
                );
            }
        );

        $( '.wrap' ).on(
            'click',
            '#save-and-reload',
            function(event) {
                event.preventDefault();
                saveOptions();
            }
        );

        $( '.spinner' ).hide();

        // call change handler on page load, to set correct state
        offlineUsageChangeHandler( $( '#allowOfflineUsage' ) );

        updateBaseURLReferences( $( '#baseUrl' ).val() );

        // set and show the previous selected deployment method
        renderSettingsBlock( current_deployment_method );

        // set the select to the current deployment type
        setDeploymentMethod( current_deployment_method );

        // hide all but WP2Static messages
        hideOtherVendorMessages();

        prepareInitialFileList();
    }
);
