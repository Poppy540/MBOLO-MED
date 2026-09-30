<#-- Mbolo Santé (revue ASVS n°2, C8) : validation du numéro saisi à « Mon identité », avant la
     création du dossier. Le numéro est rappelé pour repérer une faute de frappe ; on peut le
     corriger ou demander un nouveau code. -->
<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#import "buttons.ftl" as buttons>
<@layout.registrationLayout displayMessage=true; section>
    <#if section = "header">
        ${msg("mboloTelephoneCodeTitre")}
    <#elseif section = "form">
        <p class="${properties.kcFormHelperTextClass!}">${msg("mboloTelephoneCodeIntro", (telephoneSaisi!''))}</p>
        <form id="kc-verification-telephone-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post" novalidate="novalidate">
            <@field.input name="code_sms" label=msg("mboloCodeSms") autofocus=true autocomplete="one-time-code" />
            <@buttons.actionGroup>
                <@buttons.button id="kc-submit" name="valider" label="mboloContinuer"/>
            </@buttons.actionGroup>
            <button id="kc-renvoyer" type="submit" name="renvoyer" value="1" formnovalidate="formnovalidate"
                    class="${properties.kcButtonSecondaryClass!} ${properties.kcButtonBlockClass!}">${msg("mboloCodeSmsRenvoyer")}</button>
            <button id="kc-corriger" type="submit" name="corriger" value="1" formnovalidate="formnovalidate"
                    class="${properties.kcButtonSecondaryClass!} ${properties.kcButtonBlockClass!}">${msg("mboloTelephoneCorriger")}</button>
            <#if isAppInitiatedAction??>
            <button id="kc-annuler" type="submit" name="cancel-aia" value="true" formnovalidate="formnovalidate"
                    class="${properties.kcButtonSecondaryClass!} ${properties.kcButtonBlockClass!}">${msg("mboloRetourApplication")}</button>
            </#if>
        </form>
    </#if>
</@layout.registrationLayout>
