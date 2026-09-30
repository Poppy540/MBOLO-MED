<#-- Mbolo Santé (ADR-0024) : application d'authentification du patient, à la place du code SMS.
     `mode` : « connexion » (code avant une action sensible), « activer » (QR code, clé et premier
     code), « retirer » (code avant de revenir au SMS) ou « bloque » (message seul). -->
<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#import "buttons.ftl" as buttons>
<@layout.registrationLayout displayMessage=true; section>
    <#if section = "header">
        <#if (mode!'') == "activer">${msg("mboloApplicationActiverTitre")}<#elseif (mode!'') == "retirer">${msg("mboloApplicationRetirerTitre")}<#else>${msg("mboloApplicationTitre")}</#if>
    <#elseif section = "form">
        <form id="kc-application-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post" novalidate="novalidate">
            <#if (mode!'') == "activer">
                <p class="${properties.kcFormHelperTextClass!}">${msg("mboloApplicationActiverIntro")}</p>
                <ol>
                    <li>${msg("mboloApplicationEtape1")}</li>
                    <li>${msg("mboloApplicationEtape2")}</li>
                    <li>${msg("mboloApplicationEtape3")}</li>
                </ol>
                <img id="kc-application-qr" src="data:image/png;base64, ${qrCode}" alt="${msg('mboloApplicationQr')}" width="200" height="200"/>
                <p class="${properties.kcFormHelperTextClass!}">${msg("mboloApplicationCle")} <strong id="kc-application-cle">${cleLisible}</strong></p>
                <input type="hidden" id="totpSecret" name="totpSecret" value="${totpSecret}"/>
            <#elseif (mode!'') == "retirer">
                <p class="${properties.kcFormHelperTextClass!}">${msg("mboloApplicationRetirerIntro")}</p>
            <#elseif (mode!'') == "connexion">
                <p class="${properties.kcFormHelperTextClass!}">${msg("mboloApplicationIntro")}</p>
            </#if>
            <#if (mode!'') != "bloque">
                <@field.input name="code_application" label=msg("mboloApplicationCode") autofocus=true autocomplete="one-time-code" />
                <@buttons.actionGroup>
                    <@buttons.button id="kc-submit" name="valider" label="mboloContinuer"/>
                </@buttons.actionGroup>
            </#if>
            <#if isAppInitiatedAction??>
            <button id="kc-annuler" type="submit" name="cancel-aia" value="true" formnovalidate="formnovalidate"
                    class="${properties.kcButtonSecondaryClass!} ${properties.kcButtonBlockClass!}">${msg("mboloRetourApplication")}</button>
            </#if>
        </form>
    </#if>
</@layout.registrationLayout>
