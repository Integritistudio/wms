<template>
  <div class="loginShell">
    <div class="loginShellBg" aria-hidden="true">
      <img
        class="loginShellBgImg"
        src="/7694929c-75a7-4783-847c-854eb93805ef.png"
        alt=""
        width="1200"
        height="675"
        decoding="async"
      />
      <div class="loginShellBgWash" />
    </div>

    <header class="loginTopbar">
      <div class="loginBrandTop">
        <span class="loginMark" aria-hidden="true">L</span>
        <span class="loginBrandName">Linker</span>
      </div>
      <p class="loginTopbarTag">Shopify to 3PL —</p>
    </header>

    <div class="loginBody">
      <section class="loginBrand" aria-label="Linker">
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
  overflow: hidden;
  height: 100dvh;
  color: #0f2744;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: #eef4fb;
}

.loginShellBg {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}

.loginShellBgImg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
}

.loginShellBgWash {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(243, 247, 252, 0.45) 0%, rgba(243, 247, 252, 0.18) 48%, rgba(243, 247, 252, 0.72) 100%),
    linear-gradient(180deg, rgba(243, 247, 252, 0.35) 0%, transparent 30%, rgba(243, 247, 252, 0.35) 100%);
}

.loginTopbar {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem clamp(1.1rem, 3vw, 2.4rem) 0.2rem;
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
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.72fr);
  gap: clamp(0.75rem, 2.5vw, 2rem);
  align-items: center;
  padding: 0.35rem clamp(1.1rem, 3vw, 2.4rem) 0.9rem;
  min-height: 0;
  overflow: hidden;
}

.loginBrand {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.85rem;
  min-width: 0;
}

.loginBrandCopy {
  display: grid;
  gap: 0.45rem;
  max-width: 34rem;
  padding: 1rem 1.15rem 1.1rem;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 1.15rem;
  background: linear-gradient(
    145deg,
    rgba(255, 255, 255, 0.42) 0%,
    rgba(255, 255, 255, 0.18) 100%
  );
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.65) inset,
    0 12px 32px rgba(15, 39, 68, 0.08);
  backdrop-filter: blur(18px) saturate(1.35);
  -webkit-backdrop-filter: blur(18px) saturate(1.35);
}

.loginHeadline {
  margin: 0;
  font-size: clamp(1.7rem, 3.2vw, 2.45rem);
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
  font-size: 0.9rem;
  line-height: 1.45;
}

.loginFeatures {
  list-style: none;
  margin: 0.1rem 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.55rem 0.65rem;
  max-width: 38rem;

  li {
    display: grid;
    gap: 0.15rem;
    padding: 0.7rem 0.75rem 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 0.9rem;
    background: linear-gradient(
      160deg,
      rgba(255, 255, 255, 0.4) 0%,
      rgba(255, 255, 255, 0.14) 100%
    );
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.55) inset,
      0 8px 20px rgba(15, 39, 68, 0.06);
    backdrop-filter: blur(16px) saturate(1.3);
    -webkit-backdrop-filter: blur(16px) saturate(1.3);
  }

  strong {
    font-size: 0.74rem;
    font-weight: 700;
  }

  span:not(.loginFeatureIcon) {
    font-size: 0.68rem;
    line-height: 1.3;
    color: #5b6f86;
  }
}

.loginFeatureIcon {
  width: 1.2rem;
  height: 1.2rem;
  margin-bottom: 0.1rem;
  border-radius: 0.35rem;
  background: linear-gradient(135deg, rgba(47, 111, 237, 0.22), rgba(47, 111, 237, 0.08));
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35) inset;
}

.loginPanel {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.75rem;
  min-height: 0;
}

.loginPanelLang {
  position: absolute;
  top: -0.15rem;
  right: 0;
  z-index: 2;
}

.loginCard {
  width: min(100%, 25.5rem);
  margin-inline: auto;
  overflow: visible;
  padding: clamp(1.15rem, 2.2vw, 1.75rem);
  border: 1px solid rgba(15, 39, 68, 0.06);
  border-radius: 1.35rem;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(10px);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 18px 42px rgba(15, 39, 68, 0.12);
}

.loginCardHead {
  margin-bottom: 0.85rem;
}

.loginCardWelcome {
  margin: 0 0 0.1rem;
  color: #8a9bb0;
  font-size: 0.85rem;
}

.loginCardTitle {
  margin: 0;
  font-size: 1.65rem;
  font-weight: 750;
  letter-spacing: -0.03em;
}

.loginCardTag {
  margin: 0.25rem 0 0;
  color: #7b8ca3;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.loginSecure {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  width: min(100%, 25.5rem);
  margin-inline: auto;
  color: #5b6f86;

  p {
    margin: 0;
    font-size: 0.74rem;
    line-height: 1.4;
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
    justify-items: center;
  }

  .loginBrand {
    display: none;
  }

  .loginShellBgWash {
    background: linear-gradient(180deg, rgba(243, 247, 252, 0.55) 0%, rgba(243, 247, 252, 0.78) 100%);
  }

  .loginPanel {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .loginTopbarTag {
    display: none;
  }
}
</style>
