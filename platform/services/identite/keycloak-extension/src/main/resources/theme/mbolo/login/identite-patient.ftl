<#-- Mbolo Santé (ADR-0014) : identité du patient, saisie juste après l'inscription. Elle va dans le
     dossier médical (FHIR), jamais dans Keycloak. Peu de champs, libellés simples. -->
<#import "template.ftl" as layout>
<#import "field.ftl" as field>
<#import "buttons.ftl" as buttons>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('nom','prenom','naissance','sexe','telephone','numero_assurance'); section>
    <#if section = "header">
        ${msg("mboloIdentiteTitre")}
    <#elseif section = "form">
        <p class="${properties.kcFormHelperTextClass!}">${msg("mboloIdentiteIntro")}</p>
        <form id="kc-identite-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post" novalidate="novalidate">
            <@field.input name="nom" label=msg("mboloNom") value=(saisie.nom)!'' required=true autocomplete="family-name" autofocus=true />
            <@field.input name="prenom" label=msg("mboloPrenom") value=(saisie.prenom)!'' required=true autocomplete="given-name" />

            <@field.group name="naissance" label=msg("mboloNaissance") error=messagesPerField.get('naissance') required=true>
                <span class="${properties.kcInputClass!} <#if messagesPerField.existsError('naissance')>${properties.kcError!}</#if>">
                    <input id="naissance" name="naissance" type="date" value="${(saisie.naissance)!''}" autocomplete="bday"
                           aria-invalid="<#if messagesPerField.existsError('naissance')>true</#if>"/>
                </span>
            </@field.group>

            <@field.group name="sexe" label=msg("mboloSexe") error=messagesPerField.get('sexe')>
                <span class="${properties.kcInputClass!}">
                    <select id="sexe" name="sexe">
                        <#assign sexe = (saisie.sexe)!''>
                        <option value="" <#if sexe == ''>selected</#if>>${msg("mboloSexeNonPrecise")}</option>
                        <option value="female" <#if sexe == 'female'>selected</#if>>${msg("mboloSexeFemme")}</option>
                        <option value="male" <#if sexe == 'male'>selected</#if>>${msg("mboloSexeHomme")}</option>
                        <option value="other" <#if sexe == 'other'>selected</#if>>${msg("mboloSexeAutre")}</option>
                    </select>
                </span>
            </@field.group>

            <@field.group name="telephone" label=msg("mboloTelephone") error=messagesPerField.get('telephone') required=true>
                <span class="${properties.kcInputClass!} <#if messagesPerField.existsError('telephone')>${properties.kcError!}</#if>">
                    <input id="telephone" name="telephone" type="tel" inputmode="tel" value="${(saisie.telephone)!''}" autocomplete="tel"
                           aria-invalid="<#if messagesPerField.existsError('telephone')>true</#if>"/>
                </span>
            </@field.group>

            <@field.input name="numero_assurance" label=msg("mboloNumeroAssurance") value=(saisie.numero_assurance)!'' />
            <p id="aide-numero-assurance" class="${properties.kcFormHelperTextClass!}">${msg("mboloNumeroAssuranceAide")}</p>

            <@buttons.actionGroup>
                <@buttons.button id="kc-submit" name="enregistrer" label="mboloEnregistrer"/>
            </@buttons.actionGroup>
        </form>
    </#if>
</@layout.registrationLayout>
