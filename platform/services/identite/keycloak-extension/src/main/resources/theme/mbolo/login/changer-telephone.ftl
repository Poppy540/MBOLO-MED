<#-- Mbolo Santé (ADR-0023) : changement du numéro du dossier, à la demande du patient. L'ancien
     numéro a déjà confirmé par un code ; le nouveau le confirmera à son tour. -->
<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#import "buttons.ftl" as buttons>
<@layout.registrationLayout displayMessage=true; section>
    <#if section = "header">
        ${msg("mboloChangerTelephoneTitre")}
    <#elseif section = "form">
        <form id="kc-changer-telephone-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post" novalidate="novalidate">
            <#if (etape!'') == "nouveau">
                <p class="${properties.kcFormHelperTextClass!}">${msg("mboloChangerTelephoneIntro")}</p>
                <@field.input name="telephone" label=msg("mboloTelephoneNouveau") value=(telephone!'') autofocus=true autocomplete="tel" />
                <@buttons.actionGroup>
                    <@buttons.button id="kc-submit" name="continuer" label="mboloContinuer"/>
                </@buttons.actionGroup>
            </#if>
            <#-- Action lancée par l'application : le patient peut toujours renoncer. -->
            <button id="kc-annuler" type="submit" name="cancel-aia" value="true" formnovalidate="formnovalidate"
                    class="${properties.kcButtonSecondaryClass!} ${properties.kcButtonBlockClass!}">${msg("mboloRetourApplication")}</button>
        </form>
    </#if>
</@layout.registrationLayout>
