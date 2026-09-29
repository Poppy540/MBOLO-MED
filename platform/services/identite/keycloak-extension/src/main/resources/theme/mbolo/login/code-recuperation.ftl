<#-- Mbolo Santé (ADR-0021) : code de récupération dicté par l'équipe d'assistance, à la place du
     lien par e-mail. Un seul champ, des mots simples. -->
<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#import "buttons.ftl" as buttons>
<@layout.registrationLayout displayMessage=true; section>
    <#if section = "header">
        ${msg("mboloRecuperationTitre")}
    <#elseif section = "form">
        <p class="${properties.kcFormHelperTextClass!}">${msg("mboloRecuperationIntro")}</p>
        <form id="kc-recuperation-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post" novalidate="novalidate">
            <@field.input name="code_recuperation" label=msg("mboloCodeRecuperation") autofocus=true autocomplete="one-time-code" />
            <p id="aide-code-recuperation" class="${properties.kcFormHelperTextClass!}">${msg("mboloCodeRecuperationAide")}</p>
            <@buttons.actionGroup>
                <@buttons.button id="kc-submit" name="valider" label="mboloContinuer"/>
            </@buttons.actionGroup>
        </form>
    </#if>
</@layout.registrationLayout>
