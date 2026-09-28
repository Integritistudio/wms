<template>
  <div class="loginShell">
    <div class="loginShellBg" aria-hidden="true" />

    <header class="loginTopbar">
      <div class="loginBrandTop">
        <span class="loginMark" aria-hidden="true">L</span>
        <span class="loginBrandName">Linker</span>
      </div>
      <p class="loginTopbarTag">Shopify to 3PL —</p>
    </header>

    <div class="loginBody">
      <section class="loginBrand" aria-label="Linker">
        <figure class="loginHero">
          <img
            class="loginHeroImg"
            src="/7694929c-75a7-4783-847c-854eb93805ef.png"
            alt="Linker connecting warehouse inventory with your ecommerce storefront"
            width="1200"
            height="675"
            decoding="async"
          />
        </figure>

        <div class="loginBrandCopy">
          <h1 class="loginHeadline">
            Orders in. <em>Shipments out.</em>
          </h1>
          <p class="loginLede">
            A private translator between Shopify and the warehouse. EDI 940s go out. 945s come back.
            Tracking lands on the order — without the spreadsheet.
          </p>
        </div>

        <ul class="loginFeatures">
          <li>
            <span class="loginFeatureIcon" aria-hidden="true" />
            <strong>Real-time sync</strong>
            <span>Inventory, orders, tracking.</span>
          </li>
          <li>
            <span class="loginFeatureIcon" aria-hidden="true" />
            <strong>EDI 940 / 945</strong>
            <span>Standard, reliable flow.</span>
          </li>
          <li>
            <span class="loginFeatureIcon" aria-hidden="true" />
            <strong>Stay in control</strong>
            <span>See what's moving.</span>
          </li>
          <li>
            <span class="loginFeatureIcon" aria-hidden="true" />
            <strong>Built for 3PL</strong>
            <span>Scale with your partners.</span>
          </li>
        </ul>
      </section>

      <section class="loginPanel">
        <div class="loginPanelLang">
          <LanguagesSwitch />
        </div>
        <div class="loginCard">
          <div class="loginCardHead">
            <p class="loginCardWelcome">Welcome to</p>
            <h2 class="loginCardTitle">Linker</h2>
            <p class="loginCardTag">WMS × Ecommerce</p>
          </div>
          <LoginForm />
        </div>
        <aside class="loginSecure" aria-label="Security">
          <span class="loginSecureIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
              <path
                d="M12 3l7 3v5c0 4.5-3 8.2-7 9.5C8 19.2 5 15.5 5 11V6l7-3z"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linejoin="round"
              />
              <path
                d="M9.5 12.2l1.7 1.7 3.5-3.6"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <p>
            <strong>Secure. Private. Built for operations.</strong>
            Your data stays encrypted and protected.
          </p>
        </aside>
      </section>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted } from 'vue'
import LoginForm from '@/components/login/login-form.vue'
import LanguagesSwitch from '@/components/system/languages.vue'
import { emitter } from '@/utils/bus'

onMounted(() => {
  emitter.emit('closeLoading')
})
</script>

<style scoped lang="less">
.loginShell {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  color: #0f2744;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: #f3f7fc;
}

.loginShellBg {
  pointer-events: none;
  position: fixed;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(ellipse 55% 45% at 18% 20%, rgba(47, 111, 237, 0.14), transparent 60%),
    radial-gradient(ellipse 45% 40% at 82% 18%, rgba(125, 176, 255, 0.18), transparent 55%),
    radial-gradient(ellipse 50% 45% at 70% 88%, rgba(47, 111, 237, 0.08), transparent 60%),
    linear-gradient(165deg, #eef4fb 0%, #f7fafd 45%, #eef3f9 100%);
}

.loginTopbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.15rem clamp(1.25rem, 3.5vw, 2.75rem) 0.35rem;
}

.loginBrandTop {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.loginMark {
  display: grid;
  place-items: center;
  width: 2.15rem;
  height: 2.15rem;
  border-radius: 0.55rem;
  background: linear-gradient(145deg, #4b86f7, #1d4ed8);
  color: #fff;
  font-weight: 700;
  box-shadow: 0 8px 18px rgba(47, 111, 237, 0.28);
}

.loginBrandName {
  font-size: 1.05rem;
  font-weight: 700;
}

.loginTopbarTag {
  margin: 0;
  color: #7b8ca3;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.loginBody {
  position: relative;
  z-index: 1;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(340px, 0.78fr);
  gap: clamp(1rem, 3vw, 2.5rem);
  align-items: center;
  padding: 0.5rem clamp(1.25rem, 3.5vw, 2.75rem) 1.5rem;
}

.loginBrand {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
  min-width: 0;
}

.loginHero {
  margin: 0;
}

.loginHeroImg {
  display: block;
  width: 100%;
  height: auto;
  max-height: min(48vh, 440px);
  object-fit: contain;
  object-position: center left;
}

.loginBrandCopy {
  display: grid;
  gap: 0.55rem;
  max-width: 36rem;
}

.loginHeadline {
  margin: 0;
  font-size: clamp(1.85rem, 3.6vw, 2.65rem);
  font-weight: 750;
  line-height: 1.12;
  letter-spacing: -0.035em;

  em {
    color: #2f6fed;
    font-style: normal;
  }
}

.loginLede {
  margin: 0;
  color: #5b6f86;
  font-size: 0.95rem;
  line-height: 1.55;
}

.loginFeatures {
  list-style: none;
  margin: 0.25rem 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem 1rem;
  max-width: 40rem;

  li {
    display: grid;
    gap: 0.2rem;
  }

  strong {
    font-size: 0.78rem;
    font-weight: 700;
  }

  span:not(.loginFeatureIcon) {
    font-size: 0.72rem;
    line-height: 1.35;
    color: #5b6f86;
  }
}

.loginFeatureIcon {
  width: 1.35rem;
  height: 1.35rem;
  margin-bottom: 0.15rem;
  border-radius: 0.35rem;
  background: linear-gradient(135deg, rgba(47, 111, 237, 0.18), rgba(47, 111, 237, 0.05));
}

.loginPanel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.loginPanelLang {
  position: absolute;
  top: -0.25rem;
  right: 0;
  z-index: 2;
}

.loginCard {
  width: min(100%, 26.5rem);
  margin-inline: auto;
  padding: clamp(1.6rem, 3vw, 2.25rem);
  border: 1px solid rgba(15, 39, 68, 0.06);
  border-radius: 1.5rem;
  background: #fff;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 22px 50px rgba(15, 39, 68, 0.1);
}

.loginCardHead {
  margin-bottom: 1rem;
}

.loginCardWelcome {
  margin: 0 0 0.15rem;
  color: #8a9bb0;
  font-size: 0.92rem;
}

.loginCardTitle {
  margin: 0;
  font-size: 2rem;
  font-weight: 750;
  letter-spacing: -0.03em;
}

.loginCardTag {
  margin: 0.35rem 0 0;
  color: #7b8ca3;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.loginSecure {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  width: min(100%, 26.5rem);
  margin-inline: auto;
  color: #5b6f86;

  p {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.45;
  }

  strong {
    display: block;
    color: #0f2744;
  }
}

.loginSecureIcon {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: #e8f0fe;
  color: #2f6fed;
}

@media (max-width: 980px) {
  .loginBody {
    grid-template-columns: 1fr;
  }

  .loginFeatures {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .loginHeroImg {
    max-height: 260px;
  }
}

@media (max-width: 640px) {
  .loginTopbarTag {
    display: none;
  }

  .loginHeadline {
    font-size: 1.65rem;
  }
}
</style>
