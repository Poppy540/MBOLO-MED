<#-- Mbolo Santé (ADR-0022) : code reçu par SMS avant une action sensible (payer, partager son
     dossier, inviter un proche). Un seul champ, des mots simples ; renvoi possible. -->
<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#import "buttons.ftl" as buttons>
<@layout.registrationLayout displayMessage=true; section>
    <#if section = "header">
        ${msg("mboloCodeSmsTitre")}
    <#elseif section = "form">
        <p class="${properties.kcFormHelperTextClass!}">${msg("mboloCodeSmsIntro")}</p>
        <form id="kc-code-sms-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post" novalidate="novalidate">
            <@field.input name="code_sms" label=msg("mboloCodeSms") autofocus=true autocomplete="one-time-code" />
            <@buttons.actionGroup>
                <@buttons.button id="kc-submit" name="valider" label="mboloContinuer"/>
            </@buttons.actionGroup>
            <#-- Même formulaire : « renvoyer » est lu en premier par l'extension. -->
            <button id="kc-renvoyer" type="submit" name="renvoyer" value="1" formnovalidate="formnovalidate"
                    class="${properties.kcButtonSecondaryClass!} ${properties.kcButtonBlockClass!}">${msg("mboloCodeSmsRenvoyer")}</button>
            <#if isAppInitiatedAction??>
            <button id="kc-annuler" type="submit" name="cancel-aia" value="true" formnovalidate="formnovalidate"
                    class="${properties.kcButtonSecondaryClass!} ${properties.kcButtonBlockClass!}">${msg("mboloRetourApplication")}</button>
            </#if>
        </form>
    </#if>
</@layout.registrationLayout>
